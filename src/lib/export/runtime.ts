export class MediaExportError extends Error {}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

// Always detach observers. A rejected promise may reject with undefined/null;
// keep the success/failure flag separate from the rejection value.
export function bounded<T>(
  work: PromiseLike<T>,
  label: string,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (failed: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failed) reject(value);
      else resolve(value as T);
    };
    const abort = () => finish(true, new DOMException("Export cancelled", "AbortError"));
    const timer = setTimeout(
      () => finish(true, new Error(`${label} timed out. Please retry.`)),
      timeoutMs,
    );
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(work).then(value => finish(false, value), error => finish(true, error));
    if (signal?.aborted) abort();
  });
}

export type EncoderQueue = EventTarget & {
  readonly encodeQueueSize: number;
  readonly state: string;
};

export async function waitForQueue(
  encoder: EncoderQueue,
  low: number,
  signal?: AbortSignal,
  getError: () => Error | null = () => null,
  timeoutMs = 30_000,
): Promise<void> {
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
      cleanup = () => {
        clearInterval(poll);
        encoder.removeEventListener("dequeue", check);
      };
      check();
    }), "Encoder", signal, timeoutMs);
  } finally {
    cleanup();
  }
}

export async function waitForMedia(
  media: HTMLMediaElement,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<void> {
  throwIfAborted(signal);
  let cleanup = () => {};
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      const check = () => {
        if (media.error) reject(new Error("Media could not be loaded. Try a different source."));
        else if (media.readyState >= 2) resolve();
      };
      const events = ["loadeddata", "canplay", "error"];
      events.forEach(event => media.addEventListener(event, check));
      // Detached/paused videos may become ready without delivering another
      // loadeddata event. Observe state too, not only one-shot notifications.
      const poll = setInterval(check, 25);
      cleanup = () => {
        clearInterval(poll);
        events.forEach(event => media.removeEventListener(event, check));
      };
      check();
    }), "Loading media", signal, timeoutMs);
  } finally {
    cleanup();
  }
}

export async function seekMedia(
  media: HTMLMediaElement,
  time: number,
  signal?: AbortSignal,
  timeoutMs = 10_000,
): Promise<void> {
  if (!Number.isFinite(time) || time < 0) throw new Error("Invalid media timestamp.");
  const deadline = Date.now() + timeoutMs;
  await waitForMedia(media, signal, timeoutMs);
  throwIfAborted(signal);
  if (!media.seeking && Math.abs(media.currentTime - time) < 0.0001) return;
  let cleanup = () => {};
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      const check = () => {
        if (media.error) reject(new Error("Could not decode the background video."));
        else if (!media.seeking && media.readyState >= 2 && Math.abs(media.currentTime - time) < 0.05) resolve();
      };
      const events = ["seeked", "loadeddata", "canplay", "error"];
      events.forEach(event => media.addEventListener(event, check));
      const poll = setInterval(check, 25);
      cleanup = () => {
        clearInterval(poll);
        events.forEach(event => media.removeEventListener(event, check));
      };
      try {
        media.currentTime = time;
        check();
      } catch (error) {
        reject(error);
      }
    }), "Seeking media", signal, Math.max(1, deadline - Date.now()));
  } finally {
    cleanup();
  }
}

export function loopTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return 0;
  return ((time % duration) + duration) % duration;
}

export function recordingProgress(timelineTime: number, rate: number, wallDuration: number): number {
  if (!(rate > 0) || !(wallDuration > 0)) return 0;
  return Math.max(0, Math.min(1, timelineTime / rate / wallDuration));
}
