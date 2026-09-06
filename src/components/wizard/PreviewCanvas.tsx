import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useProjectState, type ProjectSettings } from "@/lib/project-state";
import { THEMES, type GeneratedTheme } from "@/lib/themes";
import { ARABIC_FONTS } from "@/lib/translations";
import { getVersesByChapter, getAyahTimings, getMp3QuranReciters, type Verse } from "@/lib/quran-api";
import { AMBIENT_TRACKS } from "@/lib/reciters";
import { isProNow } from "@/lib/pro-status";
import { BackgroundMedia, isVideoSource, type BackgroundSource, type BackgroundElement } from "@/lib/video/background-media";
import { MediaExportError, throwIfAborted } from "@/lib/export/runtime";

export interface PreviewHandle {
  play: () => Promise<void>;
  pause: () => void;
  seek: (t: number) => void;
  getDuration: () => number;
  getCanvas: () => HTMLCanvasElement | null;
  getAudioElement: () => HTMLAudioElement | null;
  getAudioElements: () => HTMLAudioElement[];
  getAudioContext: () => AudioContext | null;
  getAudioDestination: () => MediaStreamAudioDestinationNode | null;
  getMasterGain: () => GainNode | null;
  getReciterGain: () => GainNode | null;
  getSegmentTimings: () => Segment[];
  getCurrentTime: () => number;
  beginExport: (signal?: AbortSignal) => Promise<void>;
  endExport: () => void;
  drawFrame: (t: number, isExporting?: boolean) => Promise<void>;
  muteSpeakers: (muted: boolean) => void;
  captureThumbnail: () => Promise<string | null>;
}
type Segment = { verse_key: string; start: number; duration: number; absoluteStart: number; absoluteEnd: number };
type ExportLease = { media: BackgroundMedia; controller: AbortController; detach: () => void };
const ASPECT_DIMS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 }, "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 }, "4:5": { w: 1080, h: 1350 },
};
function getDims(s: ProjectSettings) {
  const base = ASPECT_DIMS[s.aspect];
  const scale = s.resolution === 720 ? 720 / 1080 : 1;
  return { w: Math.round(base.w * scale), h: Math.round(base.h * scale) };
}

let _audioCtx: AudioContext | null = null;
let _audioDest: MediaStreamAudioDestinationNode | null = null;
let _masterGain: GainNode | null = null;
let _speakerGain: GainNode | null = null;
let _reciterGain: GainNode | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
    _audioDest = _audioCtx.createMediaStreamDestination();
    _masterGain = _audioCtx.createGain();
    _speakerGain = _audioCtx.createGain();
    _reciterGain = _audioCtx.createGain();
    _reciterGain.connect(_masterGain);
    _masterGain.connect(_speakerGain);
    _speakerGain.connect(_audioCtx.destination);
    _masterGain.connect(_audioDest);
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
  return _audioCtx;
}
function getAudioDest() { getAudioCtx(); return _audioDest!; }
function getMasterGain() { getAudioCtx(); return _masterGain!; }
function getReciterGain() { getAudioCtx(); return _reciterGain!; }
function setSpeakerMuted(muted: boolean) { if (_speakerGain) _speakerGain.gain.value = muted ? 0 : 1; }
const _connectedAmbient = new WeakSet<HTMLAudioElement>();
function connectAmbientToCtx(el: HTMLAudioElement) {
  if (_connectedAmbient.has(el)) return;
  _connectedAmbient.add(el);
  try { getAudioCtx().createMediaElementSource(el).connect(getMasterGain()); }
  catch (e) { console.warn("ambient connect failed", e); }
}
const _connectedReciter = new WeakSet<HTMLAudioElement>();
function connectReciterToCtx(el: HTMLAudioElement) {
  if (_connectedReciter.has(el)) return;
  _connectedReciter.add(el);
  try { getAudioCtx().createMediaElementSource(el).connect(getReciterGain()); }
  catch (e) { console.warn("reciter connect failed", e); }
}

function mediaWidth(m: BackgroundElement) { return m instanceof HTMLVideoElement ? m.videoWidth : m.naturalWidth; }
function mediaHeight(m: BackgroundElement) { return m instanceof HTMLVideoElement ? m.videoHeight : m.naturalHeight; }
function drawable(m: BackgroundElement | undefined): m is BackgroundElement {
  return !!m && mediaWidth(m) > 0 && mediaHeight(m) > 0 && (!(m instanceof HTMLVideoElement) || (m.readyState >= 2 && !m.seeking));
}

let _blurScratch: HTMLCanvasElement | null = null;
function drawBlurred(ctx: CanvasRenderingContext2D, src: CanvasImageSource, dx: number, dy: number, dw: number, dh: number, radius: number) {
  const factor = Math.min(16, Math.max(2, Math.round(radius / 2)));
  const sw = Math.max(2, Math.round(dw / factor)), sh = Math.max(2, Math.round(dh / factor));
  if (!_blurScratch) _blurScratch = document.createElement("canvas");
  if (_blurScratch.width !== sw || _blurScratch.height !== sh) { _blurScratch.width = sw; _blurScratch.height = sh; }
  const g = _blurScratch.getContext("2d");
  if (!g) { ctx.drawImage(src, dx, dy, dw, dh); return; }
  g.clearRect(0, 0, sw, sh);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(_blurScratch, 0, 0, sw, sh, dx, dy, dw, dh);
}
let _vignette: { key: string; canvas: HTMLCanvasElement } | null = null;
function getVignette(w: number, h: number): HTMLCanvasElement | null {
  const iw = Math.max(1, Math.round(w)), ih = Math.max(1, Math.round(h)), key = iw + "x" + ih;
  if (_vignette?.key === key) return _vignette.canvas;
  const c = document.createElement("canvas"); c.width = iw; c.height = ih;
  const g = c.getContext("2d"); if (!g) return null;
  const grad = g.createRadialGradient(iw / 2, ih / 2, Math.min(iw, ih) * 0.3, iw / 2, ih / 2, Math.max(iw, ih) * 0.7);
  grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.65)");
  g.fillStyle = grad; g.fillRect(0, 0, iw, ih);
  _vignette = { key, canvas: c }; return c;
}
const GRAIN_TILE = 256;
let _grainTile: HTMLCanvasElement | null = null;
function getGrainTile(): HTMLCanvasElement | null {
  if (_grainTile) return _grainTile;
  const c = document.createElement("canvas"); c.width = c.height = GRAIN_TILE;
  const g = c.getContext("2d"); if (!g) return null;
  const img = g.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.random() < 0.06 ? Math.random() * 26 : 0;
  }
  g.putImageData(img, 0, 0); _grainTile = c; return c;
}
const TEXT_LAYER_CACHE_MAX = 4;
const _textLayers = new Map<string, HTMLCanvasElement>();

export const PreviewCanvas = forwardRef<PreviewHandle, { onProgress?: (t: number, d: number) => void }>(
  function PreviewCanvas({ onProgress }, ref) {
    const { settings } = useProjectState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRef = useRef<BackgroundMedia | null>(null);
    const exportRef = useRef<ExportLease | null>(null);
    const mediaVersionRef = useRef(0);
    const reciterAudioRef = useRef<HTMLAudioElement>(null);
    const ambientRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number | null>(null);
    const lastSigRef = useRef("");
    const [verses, setVerses] = useState<Verse[]>([]);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ready, setReady] = useState(false);
    const [backgroundState, setBackgroundState] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });
    const [reloadBackground, setReloadBackground] = useState(0);
    const localTimeRef = useRef(0);
    const currentSegIdxRef = useRef(0);

    useEffect(() => {
      let alive = true;
      setVerses([]);
      getVersesByChapter(settings.chapterId, { translationIds: settings.translationId ? [settings.translationId] : [], words: false })
        .then(v => { if (alive) setVerses(v); }).catch(() => {});
      return () => { alive = false; };
    }, [settings.chapterId, settings.translationId]);
    useEffect(() => {
      let alive = true;
      setReady(false); setSegments([]); setDuration(0);
      (async () => {
        const timings = await getAyahTimings(settings.chapterId, settings.reciterId);
        const reciters = await getMp3QuranReciters();
        const reciter = reciters.find(r => r.id === settings.reciterId);
        if (!alive) return;
        const filtered = timings.filter(t => t.ayah >= settings.fromAyah && t.ayah <= settings.toAyah);
        if (!filtered.length || !reciter) { setSegments([]); setReady(true); return; }
        const audioUrl = `${reciter.folder_url}${String(settings.chapterId).padStart(3, "0")}.mp3`;
        if (reciterAudioRef.current && reciterAudioRef.current.src !== audioUrl) { reciterAudioRef.current.src = audioUrl; reciterAudioRef.current.load(); }
        const baseOffset = filtered[0].start_time / 1000;
        const total = filtered[filtered.length - 1].end_time / 1000 - baseOffset + 2;
        const next = filtered.map(t => ({ verse_key: `${settings.chapterId}:${t.ayah}`, start: t.start_time / 1000 - baseOffset, duration: (t.end_time - t.start_time) / 1000, absoluteStart: t.start_time / 1000, absoluteEnd: t.end_time / 1000 }));
        currentSegIdxRef.current = 0; localTimeRef.current = 0;
        setSegments(next); setDuration(total); setReady(true);
      })().catch(() => { if (alive) { setSegments([]); setReady(true); } });
      return () => { alive = false; };
    }, [settings.reciterId, settings.chapterId, settings.fromAyah, settings.toAyah]);

    // A video is registered before loading begins. There is no poster replacement,
    // duplicate decoder, or unguarded late onloadeddata callback.
    useEffect(() => {
      let alive = true;
      const theme = THEMES.find(t => t.id === settings.themeId);
      const sources: BackgroundSource[] = [];
      if (settings.bgMode === "per-ayah") {
        for (const [key, url] of Object.entries(settings.ayahBgs)) {
          if (url && +key >= settings.fromAyah && +key <= settings.toAyah) sources.push({ key, url, kind: isVideoSource(url) ? "video" : "image" });
        }
      } else if (settings.customBg) {
        sources.push({ key: "global", url: settings.customBg, kind: isVideoSource(settings.customBg) ? "video" : "image" });
      } else if (theme?.video || theme?.poster) {
        sources.push({ key: "global", url: theme.video || theme.poster!, kind: theme.video ? "video" : "image" });
      }
      const media = new BackgroundMedia(sources);
      mediaRef.current = media;
      mediaVersionRef.current++;
      lastSigRef.current = "";
      setBackgroundState({ loading: true, error: null });
      media.ready.then(() => { if (alive) { lastSigRef.current = ""; setBackgroundState({ loading: false, error: null }); } })
        .catch(error => { if (alive) setBackgroundState({ loading: false, error: error instanceof Error ? error.message : "Could not load the background." }); });
      return () => {
        alive = false;
        if (exportRef.current?.media === media) exportRef.current.controller.abort();
        media.close();
        if (mediaRef.current === media) mediaRef.current = null;
      };
    }, [settings.bgMode, settings.ayahBgs, settings.themeId, settings.customBg, settings.fromAyah, settings.toAyah, reloadBackground]);

    useEffect(() => { lastSigRef.current = ""; }, [settings, verses, segments]);
    useEffect(() => {
      const amb = ambientRef.current; if (!amb) return;
      const track = AMBIENT_TRACKS.find(t => t.id === settings.ambientId);
      if (track) {
        if (amb.src !== track.url) { amb.src = track.url; amb.load(); if (playing) amb.play().catch(() => {}); }
        amb.volume = settings.ambientVolume;
      } else { amb.pause(); amb.removeAttribute("src"); }
    }, [settings.ambientId, settings.ambientVolume, playing]);

    const pause = useCallback(() => {
      reciterAudioRef.current?.pause(); ambientRef.current?.pause(); mediaRef.current?.pause();
      if (_masterGain && _audioCtx) { _masterGain.gain.cancelScheduledValues(_audioCtx.currentTime); _masterGain.gain.value = 1; }
      setPlaying(false);
      // Keep the rAF scheduled; it observes an explicit export lease, not a timer.
    }, []);
    const endExport = useCallback(() => {
      const lease = exportRef.current;
      if (!lease) return;
      lease.controller.abort(); lease.detach(); lease.media.unlock();
      exportRef.current = null; lastSigRef.current = "";
    }, []);
    const beginExport = useCallback(async (signal?: AbortSignal) => {
      if (exportRef.current) throw new MediaExportError("An export or thumbnail capture is already running.");
      if (!verses.length) throw new MediaExportError("Wait for the verse text to finish loading before exporting.");
      const media = mediaRef.current;
      if (!media) throw new MediaExportError("Background is still initializing. Please retry.");
      // Unlock audio while still inside the Render button's user gesture,
      // before background preparation or font/audio fetches consume that gesture.
      getAudioCtx();
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const lease: ExportLease = { media, controller, detach: () => signal?.removeEventListener("abort", abort) };
      exportRef.current = lease;
      if (signal?.aborted) controller.abort();
      pause();
      try {
        await media.lock(controller.signal);
        throwIfAborted(controller.signal);
        _textLayers.clear(); lastSigRef.current = "";
      } catch (error) {
        if (exportRef.current === lease) endExport();
        throw error;
      }
    }, [pause, endExport, verses.length]);
    useEffect(() => () => endExport(), [endExport]);

    const draw = useCallback((t: number, segIdx: number, exporting = false) => {
      if (!exporting && exportRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) { if (exporting) throw new MediaExportError("Preview canvas is unavailable."); return; }
      const media = exporting ? exportRef.current?.media : mediaRef.current;
      const currentSeg = segments[segIdx];
      const timeInSeg = t - (currentSeg?.start || 0);
      const transitioning = settings.bgMode === "per-ayah" && segIdx > 0 && timeInSeg >= 0 && timeInSeg < 1;
      const crossfade = transitioning ? timeInSeg : 1;
      const currentKey = currentSeg?.verse_key.split(":")[1] || "global";
      const prevKey = segments[segIdx - 1]?.verse_key.split(":")[1] || "global";
      const current = media?.get(currentKey), previous = media?.get(prevKey);
      const theme = THEMES.find(th => th.id === settings.themeId);
      const generated = !settings.customBg && settings.bgMode !== "per-ayah" ? theme?.generated : undefined;
      if ((!drawable(current) && !generated) || (transitioning && !drawable(previous))) {
        if (exporting) throw new MediaExportError("Selected background is not ready. Export stopped rather than inserting a black frame.");
        return; // Keep the last valid preview under the loading/error overlay.
      }
      const { w, h } = getDims(settings);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; lastSigRef.current = ""; }
      const transform = settings.bgMode === "per-ayah" ? (settings.ayahTransforms?.[+currentKey] || { zoom: 1, x: 0, y: 0 }) : { zoom: settings.bgZoom || 1, x: settings.bgPanX || 0, y: settings.bgPanY || 0 };
      const alpha = textAlphaFor(currentSeg, t, settings.animationSpeed);
      const animates = settings.kenBurns || settings.grain || generated?.type === "particles" || generated?.type === "bokeh";
      const timeSig = (m: BackgroundElement | undefined) => m instanceof HTMLVideoElement ? m.currentTime.toFixed(5) : "image";
      const sig = [w, h, mediaVersionRef.current, segIdx, alpha.toFixed(5), timeSig(current), transitioning ? timeSig(previous) + ":" + crossfade : "", animates || exporting ? t : 0, transform.zoom, transform.x, transform.y].join("|");
      if (lastSigRef.current === sig) return;
      try {
        if (typeof ctx.reset === "function") ctx.reset(); else canvas.width = w;
        ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, w, h);
        let box = { x: 0, y: 0, w, h };
        if (["rounded", "blurred-glass", "rounded-square", "blurred-glass-square"].includes(settings.frame)) {
          const bw = w * 0.95, bh = settings.frame.endsWith("square") ? bw : bw * 9 / 16;
          box = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
        } else if (settings.frame === "arch") {
          box = { x: w * 0.075, y: h * 0.225, w: w * 0.85, h: h * 0.55 };
        }
        const drawMedia = (m: BackgroundElement | undefined, opacity: number, target: typeof box, blur: number, applyTransform: boolean) => {
          ctx.globalAlpha = opacity;
          if (m) {
            const vw = mediaWidth(m), vh = mediaHeight(m);
            const bleed = blur > 0 ? blur * 2 : 0;
            const tw = target.w + bleed * 2, th = target.h + bleed * 2;
            const zoom = applyTransform ? transform.zoom : 1;
            const scale = Math.max(tw / vw, th / vh) * (settings.kenBurns ? 1 + Math.sin(t * 0.05) * 0.05 + 0.05 : 1) * zoom;
            const dw = vw * scale, dh = vh * scale;
            const dx = target.x - bleed + (tw - dw) / 2 + (applyTransform ? transform.x / 100 * dw / 2 : 0);
            const dy = target.y - bleed + (th - dh) / 2 + (applyTransform ? transform.y / 100 * dh / 2 : 0);
            if (blur > 0) drawBlurred(ctx, m, dx, dy, dw, dh, blur); else ctx.drawImage(m, dx, dy, dw, dh);
          } else if (generated) {
            ctx.save(); ctx.translate(target.x, target.y); drawGeneratedBg(ctx, generated, target.w, target.h, t); ctx.restore();
          }
          ctx.globalAlpha = 1;
        };
        if (settings.frame === "blurred-glass" || settings.frame === "blurred-glass-square") {
          const full = { x: 0, y: 0, w, h };
          if (transitioning) { drawMedia(previous, 1, full, 40, false); drawMedia(current, crossfade, full, 40, false); }
          else drawMedia(current, 1, full, 40, false);
          ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, w, h);
        }
        ctx.save();
        if (["rounded", "blurred-glass", "rounded-square", "blurred-glass-square"].includes(settings.frame)) {
          const r = Math.min(w, h) * 0.05;
          ctx.beginPath(); ctx.moveTo(box.x + r, box.y); ctx.lineTo(box.x + box.w - r, box.y);
          ctx.quadraticCurveTo(box.x + box.w, box.y, box.x + box.w, box.y + r);
          ctx.lineTo(box.x + box.w, box.y + box.h - r); ctx.quadraticCurveTo(box.x + box.w, box.y + box.h, box.x + box.w - r, box.y + box.h);
          ctx.lineTo(box.x + r, box.y + box.h); ctx.quadraticCurveTo(box.x, box.y + box.h, box.x, box.y + box.h - r);
          ctx.lineTo(box.x, box.y + r); ctx.quadraticCurveTo(box.x, box.y, box.x + r, box.y); ctx.closePath(); ctx.clip();
        } else if (settings.frame === "arch") {
          ctx.beginPath(); ctx.moveTo(box.x, box.y + box.w / 2); ctx.arc(box.x + box.w / 2, box.y + box.w / 2, box.w / 2, Math.PI, 0);
          ctx.lineTo(box.x + box.w, box.y + box.h); ctx.lineTo(box.x, box.y + box.h); ctx.closePath(); ctx.clip();
        }
        if (transitioning) { drawMedia(previous, 1, box, settings.blur, true); drawMedia(current, crossfade, box, settings.blur, true); }
        else drawMedia(current, 1, box, settings.blur, true);
        if (settings.overlayDarkness > 0) { ctx.fillStyle = `rgba(0,0,0,${settings.overlayDarkness})`; ctx.fillRect(box.x, box.y, box.w, box.h); }
        if (settings.vignette) { const vig = getVignette(box.w, box.h); if (vig) ctx.drawImage(vig, box.x, box.y, box.w, box.h); }
        if (settings.grain) {
          const tile = getGrainTile(), pat = tile ? ctx.createPattern(tile, "repeat") : null;
          if (pat) {
            const ox = Math.floor(Math.random() * GRAIN_TILE), oy = Math.floor(Math.random() * GRAIN_TILE);
            ctx.save(); ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(box.x + ox, box.y + oy, box.w, box.h); ctx.restore();
          }
        }
        ctx.restore();
        if (settings.frame === "gold-thin") {
          ctx.strokeStyle = "#C9A227"; ctx.lineWidth = Math.max(2, w * 0.006);
          const m = w * 0.03; ctx.strokeRect(m, m, w - m * 2, h - m * 2);
        }
        const pro = isProNow(), userWm = settings.watermark;
        const wm = pro ? userWm : { type: "text" as const, text: userWm.type === "text" && userWm.text.trim() ? userWm.text : "QuranReels", position: userWm.position };
        if (wm.type !== "none") {
          const label = wm.type === "logo" ? "QuranReels" : wm.text || "";
          if (label) {
            ctx.font = `${Math.round(w * 0.022)}px Inter, sans-serif`; ctx.fillStyle = pro ? "rgba(245,241,232,0.6)" : "rgba(245,241,232,0.85)"; ctx.textAlign = "left";
            const pad = w * 0.04;
            const x = wm.position === "tl" || wm.position === "bl" ? pad : w - pad - ctx.measureText(label).width;
            const y = wm.position === "tl" || wm.position === "tr" ? pad + 20 : h - pad;
            ctx.fillText(label, x, y);
          }
        }
        drawText(ctx, settings, verses, segments, alpha, segIdx, w, h);
        lastSigRef.current = sig; // Only successful compositions may be cached.
      } catch (error) {
        lastSigRef.current = "";
        if (exporting) throw new MediaExportError(`Could not draw the background frame: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }, [settings, verses, segments]);

    useEffect(() => {
      const loop = () => {
        if (!exportRef.current) {
          let t = localTimeRef.current, idx = currentSegIdxRef.current;
          if (playing && reciterAudioRef.current && segments.length) {
            const first = segments[0], last = segments[segments.length - 1], cTime = reciterAudioRef.current.currentTime;
            t = cTime - first.absoluteStart;
            const gain = getReciterGain();
            gain.gain.value = cTime >= last.absoluteEnd ? Math.max(0, 1 - (cTime - last.absoluteEnd) / 0.8) : 1;
            if (t >= duration) { pause(); t = duration; gain.gain.value = 1; }
            idx = segments.findIndex(sg => cTime >= sg.absoluteStart && cTime < sg.absoluteEnd);
            if (idx === -1) idx = cTime >= last.absoluteEnd ? segments.length - 1 : 0;
          }
          currentSegIdxRef.current = idx; localTimeRef.current = t;
          draw(t, idx); onProgress?.(t, duration);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, [draw, playing, duration, onProgress, segments, pause]);

    const drawFrame = useCallback(async (t: number, exporting?: boolean) => {
      if (!exporting && exportRef.current) return;
      const clamped = Math.max(0, Math.min(t, duration));
      let idx = segments.findIndex(sg => clamped >= sg.start && clamped < sg.start + sg.duration);
      if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
      if (exporting) {
        const lease = exportRef.current;
        if (!lease) throw new MediaExportError("Start an export session before rendering frames.");
        const keys = [segments[idx]?.verse_key.split(":")[1] || "global"];
        if (settings.bgMode === "per-ayah" && idx > 0 && clamped - segments[idx].start < 1) keys.push(segments[idx - 1].verse_key.split(":")[1]);
        await lease.media.seek(clamped, keys, lease.controller.signal);
        throwIfAborted(lease.controller.signal);
        if (exportRef.current !== lease || mediaRef.current !== lease.media) throw new MediaExportError("Background changed during export.");
      }
      draw(clamped, idx, !!exporting);
    }, [draw, duration, segments, settings.bgMode]);

    useImperativeHandle(ref, () => ({
      play: async () => {
        if (!segments.length || exportRef.current) return;
        const ctx = getAudioCtx(); if (ctx.state === "suspended") await ctx.resume();
        if (ambientRef.current) connectAmbientToCtx(ambientRef.current);
        if (reciterAudioRef.current) { connectReciterToCtx(reciterAudioRef.current); reciterAudioRef.current.playbackRate = settings.audioSpeed; }
        mediaRef.current?.play(); lastSigRef.current = "";
        const gain = getMasterGain(), realDuration = duration / settings.audioSpeed;
        gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(1, ctx.currentTime);
        if (realDuration > 1) { gain.gain.setValueAtTime(1, ctx.currentTime + realDuration - 1); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + realDuration); }
        const t = localTimeRef.current, resuming = t > 0.05 && t < duration - 0.05;
        if (!resuming) { localTimeRef.current = 0; currentSegIdxRef.current = 0; }
        if (reciterAudioRef.current) {
          reciterAudioRef.current.currentTime = segments[0].absoluteStart + (resuming ? t : 0);
          reciterAudioRef.current.play().catch(e => console.warn("reciter play error", e));
        }
        ambientRef.current?.play().catch(() => {}); setPlaying(true);
      },
      pause,
      seek: t => {
        if (exportRef.current) return;
        const clamped = Math.max(0, Math.min(t, duration)); localTimeRef.current = clamped;
        if (!segments.length) return;
        const abs = segments[0].absoluteStart + clamped;
        if (reciterAudioRef.current) reciterAudioRef.current.currentTime = abs;
        let idx = segments.findIndex(sg => abs >= sg.absoluteStart && abs < sg.absoluteEnd);
        if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
        currentSegIdxRef.current = idx;
      },
      getDuration: () => duration / settings.audioSpeed,
      getCanvas: () => canvasRef.current,
      getAudioElement: () => ambientRef.current,
      getAudioElements: () => [reciterAudioRef.current, ambientRef.current].filter(Boolean) as HTMLAudioElement[],
      getAudioContext: getAudioCtx, getAudioDestination: getAudioDest, getMasterGain, getReciterGain,
      getSegmentTimings: () => segments, getCurrentTime: () => localTimeRef.current,
      muteSpeakers: setSpeakerMuted, beginExport, endExport, drawFrame,
      captureThumbnail: async () => {
        if (!segments.length || exportRef.current) return null;
        let ownsCanvas = false;
        try {
          await beginExport();
          ownsCanvas = true;
          await drawFrame(Math.min(0.5, duration / 2), true);
          return canvasRef.current?.toDataURL("image/jpeg", 0.9) ?? null;
        } catch { return null; }
        finally { if (ownsCanvas) endExport(); }
      },
    }), [segments, duration, settings.audioSpeed, pause, beginExport, endExport, drawFrame]);

    const { w, h } = getDims(settings);
    return (
      <div className="relative mx-auto flex h-full max-h-[40vh] items-center justify-center lg:max-h-[70vh]" style={{ aspectRatio: `${w} / ${h}` }}>
        <canvas ref={canvasRef} className="h-full w-full rounded-xl bg-black shadow-2xl" aria-label="Video preview" />
        <audio ref={reciterAudioRef} crossOrigin="anonymous" preload="auto" />
        <audio ref={ambientRef} crossOrigin="anonymous" preload="auto" loop />
        {(!ready || !verses.length || backgroundState.loading) && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-sm text-muted-foreground">{!ready || !verses.length ? "Loading recitation…" : "Preparing background video…"}</div>}
        {backgroundState.error && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/80 p-4 text-center text-sm text-white"><p>{backgroundState.error}</p><button type="button" className="rounded border px-3 py-2" onClick={() => setReloadBackground(n => n + 1)}>Retry background</button></div>}
        {ready && segments.length === 0 && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 p-4 text-center text-sm text-muted-foreground">No audio available for this selection — try another reciter.</div>}
      </div>
    );
  },
);

function drawGeneratedBg(ctx: CanvasRenderingContext2D, g: GeneratedTheme, w: number, h: number, t: number) {
  switch (g.type) {
    case "solid": ctx.fillStyle = g.color; ctx.fillRect(0, 0, w, h); break;
    case "gradient": { const gr = ctx.createLinearGradient(0, 0, w, h); gr.addColorStop(0, g.from); gr.addColorStop(1, g.to); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); break; }
    case "particles": {
      ctx.fillStyle = g.bg; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.25 + (i % 5) * 0.1; ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc((i * 137 + t * 20) % w, (i * 91 + t * 10) % h, (g.size ?? 1) + (i % 4), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; break;
    }
    case "bokeh": {
      ctx.fillStyle = g.bg; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        const x = (i * 251 + t * 12) % (w + 200) - 100, y = (i * 173 + t * 6) % h, r = w * (0.03 + (i % 5) * 0.015);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `${g.color}55`); grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "pattern": {
      ctx.fillStyle = g.bg; ctx.fillRect(0, 0, w, h); const cs = w / 6;
      ctx.strokeStyle = g.fg; ctx.lineWidth = Math.max(1, w * 0.0015); ctx.globalAlpha = 0.18;
      for (let ry = -1; ry <= Math.ceil(h / cs); ry++) for (let cx = -1; cx <= 6; cx++) {
        ctx.save(); ctx.translate(cx * cs + cs / 2, ry * cs + cs / 2); ctx.strokeRect(-cs * 0.32, -cs * 0.32, cs * 0.64, cs * 0.64); ctx.rotate(Math.PI / 4); ctx.strokeRect(-cs * 0.32, -cs * 0.32, cs * 0.64, cs * 0.64); ctx.restore();
      }
      ctx.globalAlpha = 1; break;
    }
  }
}
function textAlphaFor(seg: Segment | undefined, t: number, animationSpeed: number): number {
  if (!seg) return 1;
  const inSeg = Math.max(0, t - seg.start), speed = 0.4 / animationSpeed;
  let alpha = Math.min(1, inSeg / speed);
  if (seg.duration - inSeg < speed) alpha = Math.max(0, (seg.duration - inSeg) / speed);
  return alpha;
}
function drawText(ctx: CanvasRenderingContext2D, s: ProjectSettings, verses: Verse[], segments: Segment[], alpha: number, segIdx: number, w: number, h: number) {
  if (alpha <= 0) return;
  const selected = verses.filter(v => v.verse_number >= s.fromAyah && v.verse_number <= s.toAyah);
  if (!selected.length) return;
  const seg = segments.length ? segments[Math.min(segIdx, segments.length - 1)] : undefined;
  const verse = (seg && selected.find(v => v.verse_key === seg.verse_key)) ?? selected[0];
  const layer = getTextLayer(s, verse, w, h); if (!layer) return;
  ctx.globalAlpha = alpha; ctx.drawImage(layer, 0, 0); ctx.globalAlpha = 1;
}
function getTextLayer(s: ProjectSettings, verse: Verse, w: number, h: number): HTMLCanvasElement | null {
  const translation = verse.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "";
  const key = [verse.verse_key, verse.text_uthmani, w, h, s.layout, s.platformStyle, s.maxWidthPct, s.textPanX || 0, s.textPanY || 0, s.textZoom || 1, s.textColor, s.textShadow, s.arabicFont, s.arabicSize, s.lineHeight, s.showAyahNumber, s.ayahNumberStyle, s.translationId, translation].join("|");
  const cached = _textLayers.get(key); if (cached) return cached;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); if (!g) return null;
  paintTextLayer(g, s, verse, translation, w, h);
  if (_textLayers.size >= TEXT_LAYER_CACHE_MAX) { const oldest = _textLayers.keys().next(); if (!oldest.done) _textLayers.delete(oldest.value); }
  _textLayers.set(key, c); return c;
}
function paintTextLayer(ctx: CanvasRenderingContext2D, s: ProjectSettings, verse: Verse, translation: string, w: number, h: number) {
  let arabic = verse.text_uthmani;
  if (s.showAyahNumber) {
    const num = verse.verse_number.toString().replace(/[0-9]/g, n => "٠١٢٣٤٥٦٧٨٩"[+n]);
    arabic = s.ayahNumberStyle === "ornate" ? `${arabic} \u06DD${num}` : s.ayahNumberStyle === "bracket" ? `${arabic} ﴾${num}﴿` : `${arabic} ${num}`;
  }
  let maxW = w * s.maxWidthPct / 100;
  const centerX = w / 2 + (s.textPanX || 0) / 100 * w;
  let baseY = h / 2;
  if (s.layout === "bottom-third") {
    baseY = h * 0.72;
    if (s.platformStyle === "tiktok" || s.platformStyle === "instagram") { baseY = h * 0.8; maxW = Math.min(maxW, w * 0.75); }
    else if (s.platformStyle === "youtube") baseY = h * 0.76;
  } else if (s.layout === "split") baseY = h * 0.35;
  baseY += (s.textPanY || 0) / 100 * h;
  const font = ARABIC_FONTS.find(f => f.id === s.arabicFont)?.css ?? "'Amiri', serif", scale = w / 1080;
  ctx.save(); const zoom = s.textZoom || 1;
  if (zoom !== 1) { ctx.translate(centerX, baseY); ctx.scale(zoom, zoom); ctx.translate(-centerX, -baseY); }
  ctx.textAlign = "center"; ctx.fillStyle = s.textColor;
  if (s.textShadow) { ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 12 * scale; ctx.shadowOffsetY = 2; }
  let arSize = s.arabicSize * scale;
  const minSize = arSize * 0.35;
  let lines: string[] = [], lineH = 0;
  for (;;) {
    ctx.font = `700 ${arSize}px ${font}`; lines = wrapText(ctx, arabic, maxW); lineH = arSize * s.lineHeight;
    if ((lines.length <= 4 || arSize <= minSize) && (lines.length * lineH <= h * 0.55 || arSize <= 14)) break;
    arSize *= 0.92;
  }
  let y = baseY - lines.length * lineH / 2;
  for (const line of lines) { ctx.fillText(line, centerX, y); y += lineH; }
  if (s.layout !== "arabic-only" && translation && s.translationId) {
    ctx.shadowBlur = 8 * scale; const trSize = Math.max(arSize * 0.42, 14);
    ctx.font = `500 ${trSize}px Inter, sans-serif`; ctx.fillStyle = s.textColor;
    let ty = s.layout === "split" ? h * 0.7 : y + lineH * 0.4;
    for (const line of wrapText(ctx, translation, maxW)) { ctx.fillText(line, centerX, ty); ty += trSize * 1.4; }
  }
  ctx.font = `600 ${Math.max(arSize * 0.28, 14)}px Inter, sans-serif`; ctx.fillStyle = "#C9A227";
  if (verse.verse_key) ctx.fillText(`— ${verse.verse_key} —`, centerX, h * 0.88);
  ctx.shadowBlur = 0; ctx.restore();
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line); return lines;
}
export { getDims };
