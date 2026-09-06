import { loopTime, seekMedia, waitForMedia, throwIfAborted } from "../export/runtime";

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
  /** Borrowed frame; valid until two subsequent calls. Do not close it. */
  frameAt: (timeSec: number) => Promise<DecodedFrame | null>;
  close: () => void;
};

// This is an OPTIONAL helper behind PreviewCanvas's already-loaded video.
// Its entire first-frame budget must be well below the exporter's 30s deadline.
// Previously initialization could consume all 30s before returning null, so the
// outer export failed before PreviewCanvas could run its existing seek fallback.
export const BACKGROUND_LOAD_TIMEOUT_MS = 4_000;
export const BACKGROUND_SEEK_TIMEOUT_MS = 2_000;

type SamplerOptions = {
  loadTimeoutMs?: number;
  seekTimeoutMs?: number;
};

/**
 * Browser-backed frame sampler. A stalled duplicate load/seek retires this
 * sampler and returns null, allowing PreviewCanvas to use its original video.
 * Never retain a failed sampler that retries the same timeout on every frame.
 */
export async function createBackgroundDecoder(
  url: string,
  options: SamplerOptions = {},
): Promise<BackgroundDecoder | null> {
  if (!url || typeof document === "undefined" || typeof VideoFrame === "undefined") return null;
  const video = document.createElement("video");
  const controller = new AbortController();
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let closed = false;
  let current: VideoFrame | null = null;
  let previous: VideoFrame | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    current?.close();
    previous?.close();
    current = previous = null;
    // Removing the source also cancels the duplicate network load or seek.
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
  try {
    video.src = url;
    video.load();
    await waitForMedia(video, controller.signal, options.loadTimeoutMs ?? BACKGROUND_LOAD_TIMEOUT_MS);
    if (!(video.duration > 0) || !Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
      close();
      return null;
    }
  } catch {
    close();
    return null;
  }
  const duration = video.duration;
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    duration,
    frameAt(timeSec) {
      const result = queue.then(async () => {
        if (closed) return null;
        try {
          const target = loopTime(timeSec, duration);
          await seekMedia(video, target, controller.signal, options.seekTimeoutMs ?? BACKGROUND_SEEK_TIMEOUT_MS);
          throwIfAborted(controller.signal);
          const frame = new VideoFrame(video, { timestamp: Math.round(target * 1e6) });
          previous?.close();
          previous = current;
          current = frame;
          return frame;
        } catch {
          // Includes blocked/unsupported VideoFrame capture. The original video
          // element remains owned by PreviewCanvas and is safe to fall back to.
          close();
          return null;
        }
      });
      queue = result.catch(() => {});
      return result;
    },
    close,
  };
}
