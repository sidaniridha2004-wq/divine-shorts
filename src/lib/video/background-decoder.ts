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

/**
 * Browser-backed frame sampler. Replaces the hand-written MP4 demuxer, which
 * ignored edit lists and retained stale state on loops. Seek completion is
 * required before snapshotting; timeouts never count as successful frames.
 * This prioritizes correctness: long-GOP clips may seek more slowly than the
 * former speculative sequential decoder. Encoding remains offline.
 */
export async function createBackgroundDecoder(url: string): Promise<BackgroundDecoder | null> {
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
    current?.close(); previous?.close(); current = previous = null;
    video.pause(); video.removeAttribute("src"); video.load();
  };
  try {
    video.src = url;
    video.load();
    await waitForMedia(video, controller.signal);
    if (!(video.duration > 0) || !Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
      close(); return null;
    }
  } catch { close(); return null; }
  const duration = video.duration;
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    duration,
    frameAt(timeSec) {
      const result = queue.then(async () => {
        if (closed) return null;
        const target = loopTime(timeSec, duration);
        await seekMedia(video, target, controller.signal);
        throwIfAborted(controller.signal);
        const frame = new VideoFrame(video, { timestamp: Math.round(target * 1e6) });
        previous?.close(); previous = current; current = frame;
        return frame;
      });
      queue = result.catch(() => {});
      return result;
    },
    close,
  };
}
