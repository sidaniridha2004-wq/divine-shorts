// Node.js 22.13+ / 24. Reproduces the optional-loader/export deadline regression.
import { stripTypeScriptTypes } from 'node:module';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = await mkdtemp(join(tmpdir(), 'divine-background-'));
after(() => rm(tmp, { recursive: true, force: true }));
for (const [name, file] of [
  ['runtime', new URL('../src/lib/export/runtime.ts', import.meta.url)],
  ['background', process.env.BG_MODULE_OVERRIDE || new URL('../src/lib/video/background-decoder.ts', import.meta.url)],
]) {
  const source = await readFile(file, 'utf8');
  const output = stripTypeScriptTypes(source).replace(/from ["']\.\.\/export\/runtime["']/g, 'from "./runtime.mjs"');
  await writeFile(join(tmp, name + '.mjs'), output);
}
const { bounded, waitForMedia, seekMedia } = await import(pathToFileURL(join(tmp, 'runtime.mjs')));
const { createBackgroundDecoder, BACKGROUND_LOAD_TIMEOUT_MS, BACKGROUND_SEEK_TIMEOUT_MS } = await import(pathToFileURL(join(tmp, 'background.mjs')));

class Media extends EventTarget {
  readyState = 0; error = null; seeking = false; duration = 2;
  videoWidth = 320; videoHeight = 180; time = 0; removed = false;
  seeks = 0; loads = 0; listeners = new Set(); emitSeek = true; finishSeek = true;
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.time = value; this.seeking = true; this.seeks++;
    if (this.finishSeek) setTimeout(() => {
      this.seeking = false;
      if (this.emitSeek) this.dispatchEvent(new Event('seeked'));
    }, 1);
  }
  addEventListener(type, listener, options) { this.listeners.add(listener); super.addEventListener(type, listener, options); }
  removeEventListener(type, listener, options) { this.listeners.delete(listener); super.removeEventListener(type, listener, options); }
  pause() {}
  load() { this.loads++; }
  removeAttribute(name) { if (name === 'src') this.removed = true; }
}

async function withMedia(video, run, failCapture = false) {
  const previousDocument = globalThis.document, previousFrame = globalThis.VideoFrame;
  globalThis.document = { createElement: () => video };
  globalThis.VideoFrame = class {
    constructor(media, options) {
      if (failCapture) throw new Error('Capture is unsupported');
      this.timestamp = options.timestamp; this.closed = false;
    }
    close() { this.closed = true; }
  };
  try { await run(); }
  finally {
    // Also settles the pre-fix implementation when used for a negative control.
    video.error = new Error('Test finished'); video.dispatchEvent(new Event('error'));
    globalThis.document = previousDocument; globalThis.VideoFrame = previousFrame;
  }
}

test('stalled duplicate load reaches preview fallback before the export deadline', async () => {
  const video = new Media();
  await withMedia(video, async () => {
    let fallbackCalls = 0;
    const firstFrame = async () => {
      const sampler = await createBackgroundDecoder('slow-background.mp4', { loadTimeoutMs: 10 });
      if (!sampler) { fallbackCalls++; return 'preview-frame'; }
      throw new Error('An unloaded video must not initialize a sampler');
    };
    assert.equal(await bounded(firstFrame(), 'Outer export frame', undefined, 150), 'preview-frame');
    assert.equal(fallbackCalls, 1); assert.equal(video.removed, true);
    assert.equal(video.listeners.size, 0);
  });
});
test('optional stage budgets leave time for the preview fallback', () => {
  assert.ok(BACKGROUND_LOAD_TIMEOUT_MS + BACKGROUND_SEEK_TIMEOUT_MS < 10_000);
});
test('media readiness is detected even without a new loadeddata event', async () => {
  const video = new Media();
  setTimeout(() => { video.readyState = 2; }, 5);
  await waitForMedia(video, undefined, 150);
  assert.equal(video.listeners.size, 0);
});
test('paused seek can finish without a new seeked notification', async () => {
  const video = new Media(); video.readyState = 2; video.emitSeek = false;
  await seekMedia(video, 0.5, undefined, 150);
  assert.equal(video.currentTime, 0.5); assert.equal(video.listeners.size, 0);
});
test('a stalled seek retires the sampler instead of timing out on every frame', async () => {
  const video = new Media(); video.readyState = 2; video.finishSeek = false;
  await withMedia(video, async () => {
    const sampler = await createBackgroundDecoder('fixture.mp4', { seekTimeoutMs: 10 });
    assert.ok(sampler);
    assert.equal(await sampler.frameAt(0.5), null);
    const attemptedSeeks = video.seeks;
    assert.equal(await sampler.frameAt(0.6), null);
    assert.equal(await sampler.frameAt(0.7), null);
    assert.equal(video.seeks, attemptedSeeks); assert.equal(video.removed, true);
    assert.equal(video.listeners.size, 0);
  });
});
test('unsupported frame capture also selects fallback and retires the sampler', async () => {
  const video = new Media(); video.readyState = 2;
  await withMedia(video, async () => {
    const sampler = await createBackgroundDecoder('fixture.mp4');
    assert.ok(sampler); assert.equal(await sampler.frameAt(0), null);
    assert.equal(video.removed, true); assert.equal(await sampler.frameAt(0.1), null);
  }, true);
});
test('cancelled readiness removes event listeners', async () => {
  const video = new Media(), controller = new AbortController();
  const wait = waitForMedia(video, controller.signal, 150);
  controller.abort(); await assert.rejects(wait, { name: 'AbortError' });
  assert.equal(video.listeners.size, 0);
});
test('undefined rejection is not mistaken for success', async () => {
  let rejected = false;
  try { await bounded(Promise.reject(undefined), 'test'); }
  catch (error) { rejected = true; assert.equal(error, undefined); }
  assert.equal(rejected, true);
});
