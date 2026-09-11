import { bounded, loopTime, seekMedia, throwIfAborted, MediaExportError } from "../export/runtime";
import { resolvePixabayVideoUrl } from "../pixabay-api";

export type BackgroundSource = { key: string; url: string; kind: "video" | "image" };
export type BackgroundElement = HTMLVideoElement | HTMLImageElement;

export function isVideoSource(url: string): boolean {
  return /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url);
}

let activeExportMedia: BackgroundMedia | null = null;

/** Start the already-loaded export video once. Compatibility recording then
 * draws its continuously decoded frames instead of seeking the CDN 30 times/s.
 */
export async function startRealtimeBackgroundPlayback(
  rate: number,
  signal?: AbortSignal,
): Promise<void> {
  const media = activeExportMedia;
  if (!media) throw new MediaExportError("Background export session is unavailable.");
  await media.startRealtime(rate, signal);
}

/** One media element per source, shared by preview and export. */
export class BackgroundMedia {
  readonly elements = new Map<string, BackgroundElement>();
  readonly ready: Promise<void>;
  private controller = new AbortController();
  private disposed = false;
  private locked = false;
  private playing = true;
  private realtime = false;
  private lastRealtimeProgress = 0;
  private lastRealtimeWallTime = 0;

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
    void this.ready.catch(() => {});
  }

  private assertOpen() {
    throwIfAborted(this.controller.signal);
    if (this.disposed) throw new MediaExportError("The background changed during export. Please render again.");
  }

  private videos(keys?: string[]): HTMLVideoElement[] {
    const values = keys ? keys.map(key => this.get(key)).filter(Boolean) : [...this.elements.values()];
    return [...new Set(values)].filter((value): value is HTMLVideoElement => value instanceof HTMLVideoElement);
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
    for (const element of this.videos()) element.pause();
  }

  play(): void {
    if (this.locked || this.disposed) return;
    this.playing = true;
    for (const element of this.videos()) {
      if (element.readyState >= 2) element.play().catch(() => {});
    }
  }

  async lock(signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    if (activeExportMedia && activeExportMedia !== this) {
      throw new MediaExportError("Another background export is already running.");
    }
    this.locked = true;
    this.realtime = false;
    activeExportMedia = this;
    this.pause();
    try {
      await bounded(this.ready, "Preparing background", signal, 60_000);
      this.assertOpen();
      throwIfAborted(signal);
      await Promise.all(this.videos().map(video => seekMedia(video, 0, signal, 30_000)));
      this.pause();
    } catch (error) {
      this.unlock();
      throw error;
    }
  }

  unlock(): void {
    this.realtime = false;
    this.pause();
    this.locked = false;
    if (activeExportMedia === this) activeExportMedia = null;
  }

  async startRealtime(rate: number, signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    throwIfAborted(signal);
    if (!this.locked || activeExportMedia !== this) throw new MediaExportError("The export does not own the background.");
    if (!Number.isFinite(rate) || rate <= 0) throw new MediaExportError("Invalid background playback speed.");
    const videos = this.videos();
    for (const video of videos) {
      if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
        throw new MediaExportError("The background video is not ready to record.");
      }
      video.playbackRate = rate;
    }
    this.realtime = true;
    this.lastRealtimeProgress = videos[0]?.currentTime ?? 0;
    this.lastRealtimeWallTime = performance.now();
    try {
      await Promise.all(videos.map(video => video.play()));
    } catch {
      this.realtime = false;
      throw new MediaExportError("The browser blocked background playback. Press Render again.");
    }
  }

  async seek(time: number, keys: string[], signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    if (!this.locked) throw new MediaExportError("The export does not own the background.");
    throwIfAborted(signal);
    const videos = this.videos(keys);
    if (this.realtime) {
      for (const video of videos) {
        if (video.error || video.paused || video.seeking || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          throw new MediaExportError("The background video stopped while recording. Please retry.");
        }
      }
      const lead = videos[0];
      if (lead) {
        const now = performance.now();
        const progressed = Math.abs(lead.currentTime - this.lastRealtimeProgress) > 0.01;
        if (progressed) {
          this.lastRealtimeProgress = lead.currentTime;
          this.lastRealtimeWallTime = now;
        } else if (now - this.lastRealtimeWallTime > 2_000) {
          throw new MediaExportError("The background video stalled while recording. Try another clip or 720p.");
        }
        const target = loopTime(time, lead.duration);
        const direct = Math.abs(lead.currentTime - target);
        const cyclic = Math.min(direct, Math.abs(lead.duration - direct));
        if (cyclic > 1.5) throw new MediaExportError("The background video fell out of sync while recording. Please retry.");
      }
      return;
    }
    await Promise.all(videos.map(async video => {
      const target = loopTime(time, video.duration);
      await seekMedia(video, target, signal, 30_000);
      this.assertOpen();
      throwIfAborted(signal);
      if (video.seeking || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        throw new MediaExportError("The background frame is not ready. Export stopped instead of inserting a black frame.");
      }
    }));
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    this.unlock();
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
