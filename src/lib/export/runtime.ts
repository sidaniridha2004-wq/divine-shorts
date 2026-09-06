export class MediaExportError extends Error {}

// Bounded waits release listeners/timers on completion, error and cancellation.
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

export function bounded<T>(work: PromiseLike<T>, label: string, signal?: AbortSignal, timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error !== undefined) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new DOMException("Export cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error(`${label} timed out. Please retry.`)), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(work).then(value => finish(undefined, value), error => finish(error));
    if (signal?.aborted) abort();
  });
}

export type EncoderQueue = EventTarget & { readonly encodeQueueSize: number; readonly state: string };

export async function waitForQueue(encoder: EncoderQueue, low: number, signal?: AbortSignal, getError: () => Error | null = () => null, timeoutMs = 30_000): Promise<void> {
  throwIfAborted(signal);
  let cleanup = () => {};
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      const check = () => {
        const error = getError();
        if (error) reject(error);
        else if (encoder.state === "closed") reject(new Error("The encoder closed unexpectedly."));
        else if (encoder.encodeQueueSize <= low) resolve();
      };
      const poll = setInterval(check, 25);
      encoder.addEventListener("dequeue", check);
      cleanup = () => { clearInterval(poll); encoder.removeEventListener("dequeue", check); };
      check();
    }), "Encoder", signal, timeoutMs);
  } finally { cleanup(); }
}

export async function waitForMedia(media: HTMLMediaElement, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  let cleanup = () => {};
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      const check = () => {
        if (media.error) reject(new Error("Media could not be loaded. Try a different source."));
        else if (media.readyState >= 2) resolve();
      };
      for (const event of ["loadeddata", "canplay", "error"]) media.addEventListener(event, check);
      cleanup = () => { for (const event of ["loadeddata", "canplay", "error"]) media.removeEventListener(event, check); };
      check();
    }), "Loading media", signal);
  } finally { cleanup(); }
}

export async function seekMedia(media: HTMLMediaElement, time: number, signal?: AbortSignal): Promise<void> {
  await waitForMedia(media, signal);
  if (!Number.isFinite(time) || time < 0) throw new Error("Invalid media timestamp.");
  if (!media.seeking && Math.abs(media.currentTime - time) < 0.0001) return;
  let cleanup = () => {};
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      const check = () => { if (!media.seeking && media.readyState >= 2 && Math.abs(media.currentTime - time) < 0.05) resolve(); };
      const fail = () => reject(new Error("Could not decode the background video."));
      media.addEventListener("seeked", check);
      media.addEventListener("error", fail);
      cleanup = () => { media.removeEventListener("seeked", check); media.removeEventListener("error", fail); };
      try { media.currentTime = time; } catch (error) { reject(error); }
    }), "Seeking media", signal, 10_000);
  } finally { cleanup(); }
}

export function loopTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return 0;
  return ((time % duration) + duration) % duration;
}

export function recordingProgress(timelineTime: number, rate: number, wallDuration: number): number {
  if (!(rate > 0) || !(wallDuration > 0)) return 0;
  return Math.max(0, Math.min(1, timelineTime / rate / wallDuration));
}
