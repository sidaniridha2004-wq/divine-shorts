// Node.js 22.13+ or 24: node scripts/test-export.mjs. No new dependencies.
import { stripTypeScriptTypes } from 'node:module';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const tmp = await mkdtemp(join(tmpdir(), 'divine-export-'));
after(() => rm(tmp, { recursive: true, force: true }));
for (const [name, path] of [['runtime', 'src/lib/export/runtime.ts'], ['background-decoder', 'src/lib/video/background-decoder.ts'], ['audio-mix', 'src/lib/export/audio-mix.ts']]) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const output = stripTypeScriptTypes(source).replace(/from ["'](?:\.\.\/export|\.)\/runtime["']/g, 'from "./runtime.mjs"');
  await writeFile(join(tmp, name + '.mjs'), output);
}
const { bounded, throwIfAborted, waitForQueue, seekMedia, loopTime, recordingProgress } = await import(pathToFileURL(join(tmp, 'runtime.mjs')));
const { createBackgroundDecoder } = await import(pathToFileURL(join(tmp, 'background-decoder.mjs')));
const { renderExportAudio } = await import(pathToFileURL(join(tmp, 'audio-mix.mjs')));

test('loop timestamps: exact wraps, backward positions, invalid media', () => {
  assert.equal(loopTime(4, 2), 0); assert.equal(loopTime(-0.5, 2), 1.5);
  assert.equal(loopTime(1, Infinity), 0); assert.equal(loopTime(NaN, 2), 0);
});
test('slow recitation progress uses wall time', () => {
  assert.equal(recordingProgress(6, 0.75, 16), 0.5);
  assert.equal(recordingProgress(12, 0.75, 16), 1);
});
test('bounded waits resolve values and reject timeouts', async () => {
  assert.equal(await bounded(Promise.resolve(42), 'test'), 42);
  await assert.rejects(bounded(new Promise(() => {}), 'test', undefined, 10), /timed out/);
});
test('abort interrupts pending and already-aborted work', async () => {
  const controller = new AbortController();
  const pending = bounded(new Promise(() => {}), 'test', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(bounded(Promise.resolve(1), 'test', controller.signal), { name: 'AbortError' });
  assert.throws(() => throwIfAborted(controller.signal), { name: 'AbortError' });
});
class Queue extends EventTarget { state = 'configured'; encodeQueueSize = 10; }
test('encoder queue drains', async () => {
  const encoder = new Queue(); const wait = waitForQueue(encoder, 3);
  encoder.encodeQueueSize = 2; encoder.dispatchEvent(new Event('dequeue')); await wait;
});
test('closed, failed and stuck encoders cannot hang', async () => {
  const encoder = new Queue(); encoder.state = 'closed';
  await assert.rejects(waitForQueue(encoder, 3), /closed/); encoder.state = 'configured';
  await assert.rejects(waitForQueue(encoder, 3, undefined, () => new Error('hardware failure')), /hardware failure/);
  await assert.rejects(waitForQueue(encoder, 3, undefined, () => null, 10), /timed out/);
});
test('queue wait is cancellable', async () => {
  const controller = new AbortController();
  const wait = waitForQueue(new Queue(), 3, controller.signal); controller.abort();
  await assert.rejects(wait, { name: 'AbortError' });
});
class Media extends EventTarget {
  readyState = 2; error = null; seeking = false; duration = 2;
  videoWidth = 320; videoHeight = 180; time = 0; autoSeek = true;
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.time = value; this.seeking = true;
    if (this.autoSeek) queueMicrotask(() => { this.seeking = false; this.dispatchEvent(new Event('seeked')); });
  }
  pause() {} load() {} removeAttribute() {}
}
test('seek only resolves after a drawable frame is ready', async () => {
  const video = new Media(); video.autoSeek = false; let finished = false;
  const result = seekMedia(video, 0.5).then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(finished, false);
  video.seeking = false; video.dispatchEvent(new Event('seeked')); await result;
  assert.equal(video.currentTime, 0.5);
});
test('pending seek is cancellable', async () => {
  const video = new Media(); video.autoSeek = false;
  const controller = new AbortController(); const result = seekMedia(video, 1, controller.signal);
  controller.abort(); await assert.rejects(result, { name: 'AbortError' });
});
test('sampler resets loops, serializes seeks and closes frames', async () => {
  const originalDocument = globalThis.document, originalFrame = globalThis.VideoFrame;
  const made = [];
  globalThis.document = { createElement: () => new Media() };
  globalThis.VideoFrame = class {
    constructor(video, options) { this.timestamp = options.timestamp; this.sourceTime = video.currentTime; this.closed = false; made.push(this); }
    close() { assert.equal(this.closed, false, 'frame closed twice'); this.closed = true; }
  };
  try {
    const decoder = await createBackgroundDecoder('fixture.mp4'); assert.ok(decoder);
    const a = await decoder.frameAt(1.8), b = await decoder.frameAt(2.1);
    assert.ok(Math.abs(b.sourceTime - 0.1) < 0.001); assert.equal(a.closed, false);
    const [c, d] = await Promise.all([decoder.frameAt(2.5), decoder.frameAt(3)]);
    assert.equal(c.sourceTime, 0.5); assert.equal(d.sourceTime, 1); assert.equal(a.closed, true);
    decoder.close(); decoder.close(); assert.ok(made.every(frame => frame.closed));
    assert.equal(await decoder.frameAt(0), null);
  } finally { globalThis.document = originalDocument; globalThis.VideoFrame = originalFrame; }
});
test('audio trims at selected ayah, honors speed/fades, rejects missing audio', async () => {
  const previousContext = globalThis.OfflineAudioContext, previousFetch = globalThis.fetch;
  const starts = [], gains = [], sources = [];
  globalThis.OfflineAudioContext = class {
    destination = {};
    constructor(channels, length, sampleRate) { this.length = length; this.sampleRate = sampleRate; }
    async decodeAudioData() { return { duration: 100 }; }
    createBufferSource() {
      const node = { playbackRate: { value: 1 }, connect(dest) { return dest; }, start(...args) { starts.push(args); } };
      sources.push(node); return node;
    }
    createGain() {
      const events = []; gains.push(events);
      return { gain: { setValueAtTime(...args) { events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { events.push(['ramp', ...args]); } }, connect(dest) { return dest; } };
    }
    async startRendering() { return { length: this.length, sampleRate: this.sampleRate }; }
  };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  const preview = { getSegmentTimings: () => [{ absoluteStart: 10, absoluteEnd: 16 }], getAudioElements: () => [{ src: 'recitation.mp3' }] };
  try {
    const audio = await renderExportAudio(preview, { audioSpeed: 0.75, fadeIn: false, fadeOut: false, ambientId: null }, 10);
    assert.equal(audio.length, 480000); assert.deepEqual(starts[0], [0, 10, 6]);
    assert.equal(sources[0].playbackRate.value, 0.75); assert.deepEqual(gains[0], [['set', 1, 0]]);
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(renderExportAudio(preview, { audioSpeed: 1 }, 8), /Could not load audio/);
  } finally { globalThis.OfflineAudioContext = previousContext; globalThis.fetch = previousFetch; }
});
