import { bounded, loopTime, seekMedia, throwIfAborted, MediaExportError } from "../export/runtime";
import { resolvePixabayVideoUrl } from "../pixabay-api";

export type BackgroundSource = { key: string; url: string; kind: "video" | "image" };
export type BackgroundElement = HTMLVideoElement | HTMLImageElement;

export function isVideoSource(url: string): boolean {
  return /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url);
}

/** One media element per source, shared by preview and deterministic export.
 * Never starts a second decoder/download or replaces a selected video with a poster.
 */
export class BackgroundMedia {
  readonly elements = new Map<string, BackgroundElement>();
  readonly ready: Promise<void>;
  private controller = new AbortController();
  private disposed = false;
  private locked = false;
  private playing = true;

  constructor(sources: BackgroundSource[]) {
    const loads = sources.map(async source => {
      const element = source.kind === "video" ? document.createElement("video") : new Image();
      element.crossOrigin = "anonymous";
      this.elements.set(source.key, element);
      try {
        if (element instanceof HTMLVideoElement) {
          element.muted = true;
          element.loop = true;
          element.playsInline = true;
          element.preload = "auto";
          const url = await resolvePixabayVideoUrl(source.url, this.controller.signal);
          this.assertOpen();
          await this.load(element, url);
          if (!Number.isFinite(element.duration) || element.duration <= 0) {
            throw new Error("The background video has no usable duration.");
          }
          if (this.playing && !this.locked) element.play().catch(() => {});
        } else {
          await this.load(element, source.url);
        }
      } catch (error) {
        if (this.controller.signal.aborted) throw error;
        throw new MediaExportError(`Background could not be loaded (${source.key}). ${error instanceof Error ? error.message : "Try another clip."}`);
      }
    });
    this.ready = Promise.all(loads).then(() => { this.assertOpen(); });
    // Loading starts with the preview, before an exporter awaits it.
    void this.ready.catch(() => {});
  }

  private assertOpen() {
    throwIfAborted(this.controller.signal);
    if (this.disposed) throw new MediaExportError("The background changed during export. Please render again.");
  }

  private async load(element: BackgroundElement, url: string): Promise<void> {
    let cleanup = () => {};
    try {
      await bounded(new Promise<void>((resolve, reject) => {
        const check = () => {
          if (element instanceof HTMLVideoElement) {
            if (element.error) reject(new Error("The video server or browser could not load this clip."));
            else if (element.readyState >= 2 && element.videoWidth > 0 && element.videoHeight > 0) resolve();
          } else if (element.complete && element.naturalWidth > 0) resolve();
        };
        const fail = () => reject(new Error("The media server refused the file, or its format is unsupported."));
        const events = ["load", "loadeddata", "canplay"];
        events.forEach(event => element.addEventListener(event, check));
        element.addEventListener("error", fail);
        const poll = setInterval(check, 50);
        cleanup = () => {
          clearInterval(poll);
          events.forEach(event => element.removeEventListener(event, check));
          element.removeEventListener("error", fail);
        };
        element.src = url;
        if (element instanceof HTMLVideoElement) element.load();
        check();
      }), "Loading background. The clip may be too large or its server too slow", this.controller.signal, 45_000);
    } finally { cleanup(); }
  }

  get(key: string): BackgroundElement | undefined {
    return this.elements.get(key) ?? this.elements.get("global");
  }

  pause(): void {
    this.playing = false;
    for (const element of this.elements.values()) if (element instanceof HTMLVideoElement) element.pause();
  }

  play(): void {
    if (this.locked || this.disposed) return;
    this.playing = true;
    for (const element of this.elements.values()) {
      if (element instanceof HTMLVideoElement && element.readyState >= 2) element.play().catch(() => {});
    }
  }

  async lock(signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    this.locked = true; // Set BEFORE loading resolves; late load events must not play.
    this.pause();
    await bounded(this.ready, "Preparing background", signal, 60_000);
    this.assertOpen();
    throwIfAborted(signal);
    this.pause();
  }

  unlock(): void { this.locked = false; }

  async seek(time: number, keys: string[], signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    if (!this.locked) throw new MediaExportError("The export does not own the background.");
    throwIfAborted(signal);
    const media = [...new Set(keys.map(key => this.get(key)).filter(Boolean))] as BackgroundElement[];
    await Promise.all(media.map(async element => {
      if (!(element instanceof HTMLVideoElement)) return;
      element.pause();
      // Duration is read AFTER readiness, not while it is NaN (which froze time at zero).
      const target = loopTime(time, element.duration);
      await seekMedia(element, target, signal, 10_000);
      this.assertOpen();
      throwIfAborted(signal);
      if (element.seeking || element.readyState < 2 || !element.videoWidth || !element.videoHeight) {
        throw new MediaExportError("The background frame is not ready. Export stopped instead of inserting black frames.");
      }
    }));
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    for (const element of this.elements.values()) {
      if (element instanceof HTMLVideoElement) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } else element.removeAttribute("src");
    }
    this.elements.clear();
  }
}
