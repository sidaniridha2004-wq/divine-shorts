/**
 * Accelerated background decoding for exports.
 *
 * Exporting draws one canvas frame per output frame, and with a video
 * background that used to mean seeking a paused <video> once per frame -- 1440
 * seeks for a 48s reel at 30fps, each costing 5-40ms of decoder flush and
 * refill, because browsers tune <video> for smooth playback rather than random
 * access.
 *
 * An export walks time strictly forward and the clip loops, so the read is
 * purely sequential: exactly what a decoder is built for. This module demuxes
 * the MP4 itself and streams the samples through a WebCodecs VideoDecoder,
 * which runs linearly at many times realtime and yields frames that can be
 * drawn straight onto a canvas.
 *
 * Best effort and dependency free. If there is no VideoDecoder, the clip is
 * not H.264 in a progressive MP4, the bytes are not fetchable cross-origin, or
 * the sample tables do not add up, createBackgroundDecoder returns null and
 * the caller simply keeps using its existing seek-based path.
 */

/**
 * Structurally a WebCodecs VideoFrame, declared locally so this compiles
 * regardless of how recent the DOM typings are. Valid as a CanvasImageSource.
 */
export type DecodedFrame = {
  readonly timestamp: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  close: () => void;
};

export type BackgroundDecoder = {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  /**
   * The frame belonging at `timeSec`, looping as needed. Callers must not
   * close it: it stays valid until two further calls have been made.
   */
  frameAt: (timeSec: number) => Promise<DecodedFrame | null>;
  close: () => void;
};

const DECODE_AHEAD = 16; // compressed samples kept in flight
const MAX_PENDING = 8; // decoded frames allowed to pile up
const OUTPUT_TIMEOUT_MS = 2000;
const MAX_STALLS = 3;
const WRAP_SLACK_US = 2000; // smaller backwards jumps are jitter, not a wrap
const MAX_BYTES = 320 * 1024 * 1024;
const MAX_SAMPLES = 200000;

type Sample = {
  offset: number;
  size: number;
  /** Presentation timestamp, microseconds. */
  ts: number;
  /** Sample duration, microseconds. */
  dur: number;
  key: boolean;
};

type Track = {
  codec: string;
  description: Uint8Array;
  width: number;
  height: number;
  duration: number;
  samples: Sample[];
};

type Range = [number, number];

// ── ISO base media file format ──────────────────────────────────────────

function typeAt(view: DataView, p: number): string {
  return String.fromCharCode(
    view.getUint8(p),
    view.getUint8(p + 1),
    view.getUint8(p + 2),
    view.getUint8(p + 3),
  );
}

function eachBox(
  view: DataView,
  start: number,
  end: number,
  visit: (type: string, bodyStart: number, bodyEnd: number) => void,
) {
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = typeAt(view, p + 4);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = view.getUint32(p + 8) * 4294967296 + view.getUint32(p + 12);
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    visit(type, p + header, p + size);
    p += size;
  }
}

function hex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, "0");
}

/** Visual sample entry: 8 byte box header, 78 fixed bytes, then child boxes. */
function parseStsd(view: DataView, start: number, end: number) {
  if (view.getUint32(start + 4) === 0) return null;
  const p = start + 8;
  if (p + 86 > end) return null;
  const kind = typeAt(view, p + 4);
  // H.264 only. HEVC, AV1 and VP9 fall back to the seek path.
  if (kind !== "avc1" && kind !== "avc3") return null;
  const entryEnd = Math.min(end, p + view.getUint32(p));
  const body = p + 8;
  const width = view.getUint16(body + 24);
  const height = view.getUint16(body + 26);
  if (!width || !height) return null;
  const config: Range[] = [];
  eachBox(view, body + 78, entryEnd, (t, s, e) => {
    if (t === "avcC") config.push([s, e]);
  });
  if (!config.length || config[0][1] - config[0][0] < 4) return null;
  const [cs, ce] = config[0];
  const description = new Uint8Array(view.buffer, view.byteOffset + cs, ce - cs).slice();
  const codec = "avc1." + hex2(description[1]) + hex2(description[2]) + hex2(description[3]);
  return { codec, description, width, height };
}

function parseStbl(
  view: DataView,
  start: number,
  end: number,
  timescale: number,
  mediaDuration: number,
): Track | null {
  const boxes: Record<string, Range> = {};
  eachBox(view, start, end, (type, s, e) => {
    if (!boxes[type]) boxes[type] = [s, e];
  });

  const stsd = boxes["stsd"];
  const stts = boxes["stts"];
  const stsz = boxes["stsz"];
  const stsc = boxes["stsc"];
  const stco = boxes["stco"];
  const co64 = boxes["co64"];
  const chunkBox = stco || co64;
  if (!stsd || !stts || !stsz || !stsc || !chunkBox) return null;

  const desc = parseStsd(view, stsd[0], stsd[1]);
  if (!desc) return null;

  // Decode deltas, expanded per sample.
  const deltas: number[] = [];
  const sttsEntries = view.getUint32(stts[0] + 4);
  let p = stts[0] + 8;
  for (let i = 0; i < sttsEntries && p + 8 <= stts[1]; i++, p += 8) {
    const n = view.getUint32(p);
    const d = view.getUint32(p + 4);
    for (let k = 0; k < n; k++) deltas.push(d);
    if (deltas.length > MAX_SAMPLES) return null;
  }

  // Sample sizes.
  const uniform = view.getUint32(stsz[0] + 4);
  const count = view.getUint32(stsz[0] + 8);
  if (!count || count > MAX_SAMPLES) return null;
  const sizes = new Array<number>(count);
  if (uniform > 0) {
    sizes.fill(uniform);
  } else {
    p = stsz[0] + 12;
    for (let i = 0; i < count; i++, p += 4) {
      if (p + 4 > stsz[1]) return null;
      sizes[i] = view.getUint32(p);
    }
  }

  // Chunk offsets.
  const chunkCount = view.getUint32(chunkBox[0] + 4);
  const chunkOffsets = new Array<number>(chunkCount);
  const wide = !stco && !!co64;
  p = chunkBox[0] + 8;
  for (let i = 0; i < chunkCount; i++) {
    if (wide) {
      if (p + 8 > chunkBox[1]) return null;
      chunkOffsets[i] = view.getUint32(p) * 4294967296 + view.getUint32(p + 4);
      p += 8;
    } else {
      if (p + 4 > chunkBox[1]) return null;
      chunkOffsets[i] = view.getUint32(p);
      p += 4;
    }
  }

  // Samples per chunk, then walk the chunks into absolute file offsets.
  const runs: Array<{ first: number; per: number }> = [];
  const stscEntries = view.getUint32(stsc[0] + 4);
  p = stsc[0] + 8;
  for (let i = 0; i < stscEntries && p + 12 <= stsc[1]; i++, p += 12) {
    runs.push({ first: view.getUint32(p), per: view.getUint32(p + 4) });
  }
  if (!runs.length) return null;
  const perChunk = new Array<number>(chunkCount).fill(0);
  for (let i = 0; i < runs.length; i++) {
    const from = Math.max(0, runs[i].first - 1);
    const to = i + 1 < runs.length ? Math.min(chunkCount, runs[i + 1].first - 1) : chunkCount;
    for (let c = from; c < to; c++) perChunk[c] = runs[i].per;
  }
  const offsets = new Array<number>(count);
  let si = 0;
  for (let c = 0; c < chunkCount && si < count; c++) {
    let off = chunkOffsets[c];
    for (let k = 0; k < perChunk[c] && si < count; k++) {
      offsets[si] = off;
      off += sizes[si];
      si++;
    }
  }
  if (si < count) return null;

  // Composition offsets and sync samples.
  const cts = new Array<number>(count).fill(0);
  const ctts = boxes["ctts"];
  if (ctts) {
    const entries = view.getUint32(ctts[0] + 4);
    p = ctts[0] + 8;
    let idx = 0;
    for (let i = 0; i < entries && p + 8 <= ctts[1] && idx < count; i++, p += 8) {
      const n = view.getUint32(p);
      const off = view.getInt32(p + 4);
      for (let k = 0; k < n && idx < count; k++) cts[idx++] = off;
    }
  }
  const stss = boxes["stss"];
  let keys: Set<number> | null = null;
  if (stss) {
    const entries = view.getUint32(stss[0] + 4);
    keys = new Set<number>();
    p = stss[0] + 8;
    for (let i = 0; i < entries && p + 4 <= stss[1]; i++, p += 4) keys.add(view.getUint32(p));
    if (!keys.size) return null;
  }

  const toUs = (v: number) => Math.round((v / timescale) * 1e6);
  const samples = new Array<Sample>(count);
  let dts = 0;
  for (let i = 0; i < count; i++) {
    const delta = deltas[i] ?? 0;
    samples[i] = {
      offset: offsets[i],
      size: sizes[i],
      ts: toUs(dts + cts[i]),
      dur: toUs(delta),
      key: keys ? keys.has(i + 1) : true,
    };
    dts += delta;
  }
  const duration = (mediaDuration > 0 ? mediaDuration : dts) / timescale;
  if (!(duration > 0)) return null;
  return { ...desc, duration, samples };
}

function parseTrak(view: DataView, start: number, end: number): Track | null {
  let timescale = 0;
  let mediaDuration = 0;
  const stbls: Range[] = [];
  eachBox(view, start, end, (t1, s1, e1) => {
    if (t1 !== "mdia") return;
    eachBox(view, s1, e1, (t2, s2, e2) => {
      if (t2 === "mdhd") {
        if (view.getUint8(s2) === 1) {
          timescale = view.getUint32(s2 + 20);
          mediaDuration = view.getUint32(s2 + 24) * 4294967296 + view.getUint32(s2 + 28);
        } else {
          timescale = view.getUint32(s2 + 12);
          mediaDuration = view.getUint32(s2 + 16);
        }
      } else if (t2 === "minf") {
        eachBox(view, s2, e2, (t3, s3, e3) => {
          if (t3 === "stbl") stbls.push([s3, e3]);
        });
      }
    });
  });
  if (!timescale || !stbls.length) return null;
  return parseStbl(view, stbls[0][0], stbls[0][1], timescale, mediaDuration);
}

/** Progressive MP4 only: a fragmented file carries no stbl sample tables. */
function parseMp4(buffer: ArrayBuffer): Track | null {
  const view = new DataView(buffer);
  const moov: Range[] = [];
  eachBox(view, 0, view.byteLength, (type, s, e) => {
    if (type === "moov") moov.push([s, e]);
  });
  if (!moov.length) return null;
  const traks: Range[] = [];
  eachBox(view, moov[0][0], moov[0][1], (type, s, e) => {
    if (type === "trak") traks.push([s, e]);
  });
  for (const [s, e] of traks) {
    // Audio tracks drop out on the avc1 check inside parseStsd.
    const track = parseTrak(view, s, e);
    if (track && track.samples.length) return track;
  }
  return null;
}

// ── Decode pipeline ─────────────────────────────────────────────────────

function createPipeline(
  track: Track,
  bytes: Uint8Array,
  config: unknown,
  Decoder: any,
  Chunk: any,
): BackgroundDecoder | null {
  let pending: DecodedFrame[] = [];
  let current: DecodedFrame | null = null;
  let previous: DecodedFrame | null = null;
  let sampleIdx = 0;
  let needKey = true;
  let flushed = false;
  let failed = false;
  let closed = false;
  let stalls = 0;
  let waiter: (() => void) | null = null;

  const wake = () => {
    const w = waiter;
    waiter = null;
    if (w) w();
  };

  const drop = (f: DecodedFrame | null) => {
    if (!f) return;
    try {
      f.close();
    } catch {
      /* already closed */
    }
  };

  const decoder = new Decoder({
    output: (frame: DecodedFrame) => {
      if (closed) {
        drop(frame);
        return;
      }
      // Keep presentation order; H.264 with B-frames can arrive reordered.
      let i = pending.length;
      while (i > 0 && pending[i - 1].timestamp > frame.timestamp) i--;
      pending.splice(i, 0, frame);
      wake();
    },
    error: () => {
      failed = true;
      wake();
    },
  });

  try {
    decoder.configure(config);
  } catch {
    try {
      decoder.close();
    } catch {
      /* ignore */
    }
    return null;
  }

  const clearPending = () => {
    for (const f of pending) drop(f);
    pending = [];
  };

  /** Take the next frame, keeping the previous one alive for the caller. */
  const adopt = (frame: DecodedFrame) => {
    drop(previous);
    previous = current;
    current = frame;
  };

  const feed = () => {
    while (
      !failed &&
      pending.length < MAX_PENDING &&
      decoder.decodeQueueSize < DECODE_AHEAD &&
      sampleIdx < track.samples.length
    ) {
      const s = track.samples[sampleIdx++];
      if (needKey && !s.key) continue;
      needKey = false;
      try {
        decoder.decode(
          new Chunk({
            type: s.key ? "key" : "delta",
            timestamp: s.ts,
            duration: s.dur,
            data: bytes.subarray(s.offset, s.offset + s.size),
          }),
        );
      } catch {
        failed = true;
      }
    }
  };

  const waitForOutput = () =>
    new Promise<void>((resolve) => {
      if (pending.length || failed) {
        resolve();
        return;
      }
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        resolve();
      };
      waiter = settle;
      setTimeout(settle, OUTPUT_TIMEOUT_MS);
    });

  /** Looping restarts at the first keyframe, which beats any kind of seek. */
  const restart = () => {
    clearPending();
    try {
      decoder.reset();
      decoder.configure(config);
    } catch {
      failed = true;
    }
    sampleIdx = 0;
    needKey = true;
    flushed = false;
    stalls = 0;
  };

  const advance = async (targetUs: number): Promise<DecodedFrame | null> => {
    if (current && current.timestamp > targetUs + WRAP_SLACK_US) restart();

    for (let guard = 0; guard < 8192 && !failed; guard++) {
      while (pending.length && pending[0].timestamp <= targetUs) {
        adopt(pending.shift() as DecodedFrame);
      }
      // Nothing better exists before the clip's first presentation time.
      if (!current && pending.length) adopt(pending.shift() as DecodedFrame);
      // A later frame in hand proves the current one is the right one.
      if (current && pending.length && pending[0].timestamp > targetUs) break;

      if (sampleIdx >= track.samples.length && !pending.length && decoder.decodeQueueSize === 0) {
        if (flushed) break;
        flushed = true;
        try {
          await decoder.flush();
        } catch {
          /* keep whatever we already have */
        }
        continue;
      }

      feed();
      if (failed) break;
      if (!pending.length) {
        await waitForOutput();
        if (pending.length) {
          stalls = 0;
        } else if (++stalls >= MAX_STALLS) {
          failed = true;
        }
      }
    }
    return failed ? null : current;
  };

  return {
    width: track.width,
    height: track.height,
    duration: track.duration,
    frameAt: async (timeSec: number) => {
      if (closed || failed) return null;
      let t = Number.isFinite(timeSec) ? timeSec : 0;
      t = t % track.duration;
      if (t < 0) t += track.duration;
      return advance(Math.round(t * 1e6));
    },
    close: () => {
      if (closed) return;
      closed = true;
      clearPending();
      drop(previous);
      drop(current);
      previous = null;
      current = null;
      try {
        decoder.close();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function createBackgroundDecoder(url: string): Promise<BackgroundDecoder | null> {
  const g = globalThis as any;
  if (!url || !g.VideoDecoder || !g.EncodedVideoChunk) return null;

  let buffer: ArrayBuffer;
  try {
    // The preview element has already downloaded this clip, so in practice
    // this reads the HTTP cache rather than fetching it a second time.
    const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null;
    buffer = await res.arrayBuffer();
  } catch {
    return null; // typically a CDN that will not serve the bytes cross-origin
  }
  if (buffer.byteLength > MAX_BYTES) return null;

  let track: Track | null = null;
  try {
    track = parseMp4(buffer);
  } catch {
    return null;
  }
  if (!track) return null;

  const config = {
    codec: track.codec,
    codedWidth: track.width,
    codedHeight: track.height,
    description: track.description,
    hardwareAcceleration: "no-preference",
    // Buffering ahead is the whole point here; per-frame latency is irrelevant.
    optimizeForLatency: false,
  };

  try {
    const support = await g.VideoDecoder.isConfigSupported(config);
    if (!support || support.supported === false) return null;
    return createPipeline(track, new Uint8Array(buffer), config, g.VideoDecoder, g.EncodedVideoChunk);
  } catch {
    return null;
  }
}
