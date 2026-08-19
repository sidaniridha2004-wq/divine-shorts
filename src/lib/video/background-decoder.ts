/**
 * Accelerated background decoding for exports.
 *
 * Exporting a reel draws one canvas frame per output frame, and when the
 * background is a video clip that used to mean seeking a paused <video>
 * element once per frame -- 1440 times for a 48s reel at 30fps. Browsers tune
 * <video> for smooth forward playback rather than random access, so each of
 * those seeks costs 5-40ms of decoder flush and refill no matter how the
 * request is phrased. That is tens of seconds of an export spent waiting.
 *
 * The access pattern never actually needed seeking. An export walks time
 * strictly forward and the background clip loops, so it is a purely
 * sequential read -- exactly what a video decoder is built for. This module
 * demuxes the MP4 itself and feeds the compressed samples to a WebCodecs
 * VideoDecoder, which decodes linearly at many times realtime and returns
 * frames that can be drawn straight onto a canvas.
 *
 * Everything here is best effort and dependency free. If the browser has no
 * VideoDecoder, the clip is not H.264 in a progressive MP4, the bytes cannot
 * be fetched cross-origin, or the sample tables do not add up, then
 * createBackgroundDecoder returns null and the caller simply keeps using its
 * existing seek-based path.
 */

/**
 * A decoded frame. Structurally a WebCodecs VideoFrame, declared locally so
 * this module compiles regardless of how recent the DOM typings are. It is a
 * valid CanvasImageSource.
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
  /** Clip length in seconds. */
  readonly duration: number;
  /**
   * The frame that belongs on screen at `timeSec`, looping the clip as
   * needed. Callers must not close the returned frame: it is owned here and
   * stays valid until two further calls have been made.
   */
  frameAt: (timeSec: number) => Promise<DecodedFrame | null>;
  close: () => void;
};

/** Compressed samples kept in flight so the decoder always has work queued. */
const DECODE_AHEAD = 16;
/** Decoded frames allowed to pile up before we stop feeding the decoder. */
const MAX_PENDING = 8;
/** A decoder that goes this long without emitting anything is stuck. */
const OUTPUT_TIMEOUT_MS = 2000;
const MAX_STALLS = 3;
/** Backwards jumps smaller than this are timing jitter, not a loop wrap. */
const WRAP_SLACK_US = 2000;
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