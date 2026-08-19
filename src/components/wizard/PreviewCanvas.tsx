import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useProjectState, type ProjectSettings } from "@/lib/project-state";
import { THEMES, type GeneratedTheme } from "@/lib/themes";
import { ARABIC_FONTS } from "@/lib/translations";
import { getVersesByChapter, getAyahTimings, getMp3QuranReciters, type Verse } from "@/lib/quran-api";
import { AMBIENT_TRACKS } from "@/lib/reciters";
import { isProNow } from "@/lib/pro-status";

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
  getSegmentTimings: () => { verse_key: string; start: number; duration: number; absoluteStart: number; absoluteEnd: number }[];
  getCurrentTime: () => number;
  drawFrame: (t: number, isExporting?: boolean) => Promise<void>;
  muteSpeakers: (muted: boolean) => void;
  captureThumbnail: () => Promise<string | null>;
}

type Segment = { verse_key: string; start: number; duration: number; absoluteStart: number; absoluteEnd: number };

const ASPECT_DIMS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

function getDims(s: ProjectSettings) {
  const base = ASPECT_DIMS[s.aspect];
  const scale = s.resolution === 720 ? 720 / 1080 : 1;
  return { w: Math.round(base.w * scale), h: Math.round(base.h * scale) };
}

// ── Singleton AudioContext ──────────────────────────────────────────────────
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
function setSpeakerMuted(muted: boolean) {
  if (_speakerGain) _speakerGain.gain.value = muted ? 0 : 1;
}

// ── Background video seeking ────────────────────────────────────────────
// Seeking a paused <video> is by far the most expensive operation in the
// export pipeline, so this helper exists to keep it as cheap as possible.
//
// The original implementation registered requestVideoFrameCallback *inside*
// the "seeked" listener. rVFC only fires when a video presents a NEW frame,
// which a paused element that has just finished seeking never does -- so the
// callback almost never ran and virtually every frame fell through to the
// 1500ms safety timeout instead. Compounding that, the skip threshold was
// 0.05s while one frame at 30fps is only 0.0333s, so the seek fired on
// roughly every other frame and the background silently ran at ~15fps.
// A 48s reel therefore spent ~720 seeks x 1.5s ~= 18 minutes waiting.
//
// "seeked" already guarantees the frame is decoded and drawable, so resolve
// on it directly and keep only a short safety net.
const SEEK_EPSILON = 0.015;
const SEEK_TIMEOUT_MS = 250;

function seekVideoFrame(v: HTMLVideoElement, time: number): Promise<void> {
  // A non-finite duration (still loading, or a stream) used to produce a NaN
  // currentTime assignment, after which "seeked" never fires at all.
  if (!Number.isFinite(time) || v.readyState < 2) return Promise.resolve();
  if (Math.abs(v.currentTime - time) < SEEK_EPSILON) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done, { once: true });
    timer = setTimeout(done, SEEK_TIMEOUT_MS);
    try {
      v.currentTime = time;
    } catch {
      done();
    }
  });
}

function loopedTime(v: HTMLVideoElement, t: number): number {
  const d = v.duration;
  return Number.isFinite(d) && d > 0 ? t % d : 0;
}

// ── Cheap blur ──────────────────────────────────────────────────────────
// ctx.filter = "blur(40px)" on a 1080x1920 canvas is a separable gaussian
// convolution over ~2 million pixels and costs tens of milliseconds PER CALL.
// The blurred-glass frames issue two of them per frame, which across 1440
// frames was minutes of the export on its own.
//
// Downscaling by roughly the blur radius and letting bilinear filtering
// smooth the image on the way back up is visually near-identical at the large
// radii used here, for a small fraction of the cost.
let _blurScratch: HTMLCanvasElement | null = null;

function getBlurScratch(w: number, h: number): HTMLCanvasElement {
  if (!_blurScratch) _blurScratch = document.createElement("canvas");
  if (_blurScratch.width !== w || _blurScratch.height !== h) {
    _blurScratch.width = w;
    _blurScratch.height = h;
  }
  return _blurScratch;
}

function drawBlurred(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  radius: number,
) {
  const factor = Math.min(16, Math.max(2, Math.round(radius / 2)));
  const sw = Math.max(2, Math.round(dw / factor));
  const sh = Math.max(2, Math.round(dh / factor));
  const scratch = getBlurScratch(sw, sh);
  const sctx = scratch.getContext("2d");
  if (!sctx) {
    ctx.drawImage(src, dx, dy, dw, dh);
    return;
  }
  sctx.clearRect(0, 0, sw, sh);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(src, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, 0, 0, sw, sh, dx, dy, dw, dh);
}

// ── Cached vignette ─────────────────────────────────────────────────────
// Depends only on the clip box size, so building the radial gradient and
// filling it on every frame was pure waste.
let _vignette: { key: string; canvas: HTMLCanvasElement } | null = null;

function getVignette(w: number, h: number): HTMLCanvasElement | null {
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  const key = iw + "x" + ih;
  if (_vignette && _vignette.key === key) return _vignette.canvas;
  const c = document.createElement("canvas");
  c.width = iw;
  c.height = ih;
  const g = c.getContext("2d");
  if (!g) return null;
  const r1 = Math.min(iw, ih) * 0.3;
  const r2 = Math.max(iw, ih) * 0.7;
  const grad = g.createRadialGradient(iw / 2, ih / 2, r1, iw / 2, ih / 2, r2);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.65)");
  g.fillStyle = grad;
  g.fillRect(0, 0, iw, ih);
  _vignette = { key, canvas: c };
  return c;
}

// ── Cached film grain ───────────────────────────────────────────────────
// Was 400 separate fillRect calls per frame. A tileable noise texture gives
// the same look in a single blit, and jittering the origin keeps it moving.
const GRAIN_TILE = 256;
let _grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement | null {
  if (_grainTile) return _grainTile;
  const c = document.createElement("canvas");
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(GRAIN_TILE, GRAIN_TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    // Sparse bright specks, matching the density of the old random dots.
    d[i + 3] = Math.random() < 0.06 ? Math.random() * 26 : 0;
  }
  g.putImageData(img, 0, 0);
  _grainTile = c;
  return c;
}

// ── Cached text layer ───────────────────────────────────────────────────
// The Arabic text, translation, ayah number and reference are identical for
// every frame of a given verse, yet they were re-rendered from scratch each
// time -- including drop shadows and a shrink-to-fit search that calls
// measureText once per word. Painting once per verse into an offscreen layer
// and blitting it with the fade alpha turns ~1440 text renders into ~7.
const TEXT_LAYER_CACHE_MAX = 4;
const _textLayers = new Map<string, HTMLCanvasElement>();

// ── Duration probing (fallback) ─────────────────────────────────────────
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.crossOrigin = "anonymous";
    let settled = false;
    const done = (v: number | null) => {
      if (settled) return;
      settled = true;
      a.onloadedmetadata = null;
      a.onerror = null;
      resolve(v);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () =>
      done(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null);
    a.onerror = () => done(null);
    a.src = url;
    setTimeout(() => done(null), 8000);
  });
}

const _connectedAmbient = new WeakSet<HTMLAudioElement>();
function connectAmbientToCtx(el: HTMLAudioElement) {
  if (_connectedAmbient.has(el)) return;
  _connectedAmbient.add(el);
  try {
    const ctx = getAudioCtx();
    const src = ctx.createMediaElementSource(el);
    src.connect(getMasterGain());
  } catch (e) {
    console.warn("ambient connect failed", e);
  }
}

const _connectedReciter = new WeakSet<HTMLAudioElement>();
function connectReciterToCtx(el: HTMLAudioElement) {
  if (_connectedReciter.has(el)) return;
  _connectedReciter.add(el);
  try {
    const ctx = getAudioCtx();
    const src = ctx.createMediaElementSource(el);
    src.connect(getReciterGain());
  } catch (e) {
    console.warn("reciter connect failed", e);
  }
}

export const PreviewCanvas = forwardRef<PreviewHandle, { onProgress?: (t: number, d: number) => void }>(
  function PreviewCanvas({ onProgress }, ref) {
    const { settings } = useProjectState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgMediaRef = useRef<Record<string, HTMLVideoElement | HTMLImageElement>>({});
    const reciterAudioRef = useRef<HTMLAudioElement>(null);
    const ambientRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number | null>(null);
    const lastSigRef = useRef<string>("");
    const [verses, setVerses] = useState<Verse[]>([]);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ready, setReady] = useState(false);
    const localTimeRef = useRef(0);
    const currentSegIdxRef = useRef(0);

    // Load verses when chapter or translation changes
    useEffect(() => {
      let alive = true;
      setReady(false);
      getVersesByChapter(settings.chapterId, {
        translationIds: settings.translationId ? [settings.translationId] : [],
        words: false,
      })
        .then((v) => {
          if (!alive) return;
          setVerses(v);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [settings.chapterId, settings.translationId]);

    // Load audio timings and set up single reciter stream
    useEffect(() => {
      let alive = true;
      setReady(false);
      setSegments([]);
      setDuration(0);
      (async () => {
        const timings = await getAyahTimings(settings.chapterId, settings.reciterId);
        const reciters = await getMp3QuranReciters();
        const reciter = reciters.find(r => r.id === settings.reciterId);
        
        if (!alive) return;
        if (!timings.length || !reciter) {
          setSegments([]);
          setReady(true);
          return;
        }

        const filtered = timings.filter(t => t.ayah >= settings.fromAyah && t.ayah <= settings.toAyah);
        if (!filtered.length) {
          setSegments([]);
          setReady(true);
          return;
        }

        const audioUrl = `${reciter.folder_url}${String(settings.chapterId).padStart(3, '0')}.mp3`;
        if (reciterAudioRef.current && reciterAudioRef.current.src !== audioUrl) {
          reciterAudioRef.current.src = audioUrl;
          reciterAudioRef.current.load();
        }

        const baseOffset = filtered[0].start_time / 1000;
        const PADDING = 2.0; // 2s padding to give the video an outro, while audio fades out
        const totalDuration = (filtered[filtered.length - 1].end_time / 1000) - baseOffset + PADDING;

        const newSegments = filtered.map((t, idx) => {
          const absStart = t.start_time / 1000;
          let absEnd = t.end_time / 1000;
          // Padding is added to totalDuration, not to the last segment's duration
          
          return {
            verse_key: `${settings.chapterId}:${t.ayah}`,
            start: absStart - baseOffset,
            duration: absEnd - absStart,
            absoluteStart: absStart,
            absoluteEnd: absEnd,
          };
        });

        currentSegIdxRef.current = 0;
        localTimeRef.current = 0;
        setSegments(newSegments);
        setDuration(totalDuration);
        setReady(true);
      })().catch(() => {
        if (alive) {
          setSegments([]);
          setReady(true);
        }
      });
      return () => {
        alive = false;
      };
    }, [settings.reciterId, settings.chapterId, settings.fromAyah, settings.toAyah]);

    // Load background
    useEffect(() => {
      bgMediaRef.current = {};
      lastSigRef.current = "";
      const theme = THEMES.find((t) => t.id === settings.themeId);

      const loadImage = (src: string, key: string) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (!bgMediaRef.current[key] || !(bgMediaRef.current[key] instanceof HTMLVideoElement)) {
            bgMediaRef.current[key] = img;
            lastSigRef.current = "";
          }
        };
        img.src = src;
      };

      const loadVideo = (src: string, key: string) => {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        // "auto" keeps the whole clip buffered, which is what makes the
        // per-frame export seeks cheap instead of network-bound.
        v.preload = "auto";
        v.onloadeddata = () => {
          bgMediaRef.current[key] = v;
          lastSigRef.current = "";
          v.play().catch(() => {});
        };
        v.onerror = () => {};
        v.src = src;
      };

      if (settings.bgMode === "per-ayah") {
        Object.entries(settings.ayahBgs).forEach(([ayahNum, src]) => {
          if (src) loadImage(src, ayahNum);
        });
      } else {
        if (settings.customBg) {
          if (settings.customBg.startsWith("data:video") || /\.(mp4|webm|mov)/i.test(settings.customBg)) {
            loadVideo(settings.customBg, "global");
          } else {
            loadImage(settings.customBg, "global");
          }
        } else if (theme?.poster) {
          loadImage(theme.poster, "global");
          if (theme.video) loadVideo(theme.video, "global");
        }
      }
    }, [settings.bgMode, settings.ayahBgs, settings.themeId, settings.customBg]);

    // Ambient track logic
    useEffect(() => {
      const amb = ambientRef.current;
      if (!amb) return;
      const track = AMBIENT_TRACKS.find(t => t.id === settings.ambientId);
      if (track) {
        if (amb.src !== track.url) {
           amb.src = track.url;
           amb.load();
           if (playing) amb.play().catch(() => {});
        }
        amb.volume = settings.ambientVolume;
      } else {
        amb.pause();
        amb.src = "";
      }
    }, [settings.ambientId, settings.ambientVolume, playing]);

    const draw = useCallback(
      (t: number, segIdx: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const { w, h } = getDims(settings);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          lastSigRef.current = "";
        }

        const currentSeg = segments[segIdx];
        const timeInSeg = t - (currentSeg?.start || 0);
        const TRANSITION_DUR = 1.0; // 1 second crossfade
        const isTransitioning = settings.bgMode === "per-ayah" && segIdx > 0 && timeInSeg >= 0 && timeInSeg < TRANSITION_DUR;
        const crossfadeProgress = isTransitioning ? timeInSeg / TRANSITION_DUR : 1;

        const currentAyahNum = parseInt(segments[segIdx]?.verse_key?.split(":")[1] || "0");
        const transform = settings.bgMode === "per-ayah" 
          ? (settings.ayahTransforms?.[currentAyahNum] || { zoom: 1, x: 0, y: 0 })
          : { zoom: settings.bgZoom || 1, x: settings.bgPanX || 0, y: settings.bgPanY || 0 };

        let clipBox = { x: 0, y: 0, w, h };
        if (settings.frame === "rounded" || settings.frame === "blurred-glass") {
          const rectW = w * 0.95;
          const rectH = rectW * (9 / 16); // 16:9 aspect ratio makes it vertically narrow
          clipBox = { x: (w - rectW) / 2, y: (h - rectH) / 2, w: rectW, h: rectH };
        } else if (settings.frame === "rounded-square" || settings.frame === "blurred-glass-square") {
          const rectW = w * 0.95;
          const rectH = rectW; // 1:1 aspect ratio
          clipBox = { x: (w - rectW) / 2, y: (h - rectH) / 2, w: rectW, h: rectH };
        } else if (settings.frame === "arch") {
          const rectW = w * 0.85;
          const rectH = h * 0.55;
          clipBox = { x: (w - rectW) / 2, y: (h - rectH) / 2, w: rectW, h: rectH };
        }

        const activeTheme = THEMES.find((th) => th.id === settings.themeId);
        const wantsVideo = !!settings.customBg || !!activeTheme?.video || settings.bgMode === "per-ayah";

        const currentAyah = segments[segIdx]?.verse_key?.split(":")[1] || "global";
        let vCurrent = bgMediaRef.current[currentAyah] || bgMediaRef.current["global"];
        const prevAyah = segments[segIdx - 1]?.verse_key?.split(":")[1] || "global";
        let vPrev = bgMediaRef.current[prevAyah] || bgMediaRef.current["global"];

        const textAlpha = textAlphaFor(currentSeg, t, settings.animationSpeed);

        // ── Skip frames whose composition is byte-identical to the last one ──
        // For still images and solid/gradient/pattern themes with Ken Burns
        // off, most consecutive frames are the same, so the render pass
        // collapses to roughly one draw per verse. Anything genuinely
        // time-varying is folded into the signature below and still redraws.
        const generatedAnimates =
          !!activeTheme?.generated &&
          (activeTheme.generated.type === "particles" ||
            activeTheme.generated.type === "bokeh");
        const bgTime =
          vCurrent instanceof HTMLVideoElement
            ? vCurrent.currentTime.toFixed(4)
            : "static";
        const prevBgTime =
          vPrev instanceof HTMLVideoElement ? vPrev.currentTime.toFixed(4) : "static";
        const timeVarying = settings.kenBurns || generatedAnimates || settings.grain;
        const sig = [
          w,
          h,
          segIdx,
          segments[segIdx]?.verse_key ?? "",
          textAlpha.toFixed(4),
          bgTime,
          isTransitioning ? prevBgTime + ":" + crossfadeProgress.toFixed(4) : "",
          timeVarying ? t.toFixed(4) : "0",
          transform.zoom,
          transform.x,
          transform.y,
          settings.frame,
          settings.themeId,
          settings.customBg ? "custom" : "theme",
          settings.bgMode,
          settings.blur,
          settings.overlayDarkness,
          settings.vignette ? 1 : 0,
          settings.grain ? 1 : 0,
          settings.watermark.type,
          settings.watermark.text,
          settings.watermark.position,
        ].join("|");
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;

        if (typeof ctx.reset === "function") {
          ctx.reset();
        } else {
          // Fallback for older browsers: force state reset by reassigning width
          canvas.width = w;
        }

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);

        const drawMedia = (v: HTMLVideoElement | HTMLImageElement | null, alpha: number, box: {x:number,y:number,w:number,h:number}, blurVal: number, applyTransform: boolean) => {
          const vw = ((v as any)?.videoWidth ?? (v as HTMLImageElement)?.naturalWidth ?? 0) as number;
          const vh = ((v as any)?.videoHeight ?? (v as HTMLImageElement)?.naturalHeight ?? 0) as number;
          const isVideo = v && 'readyState' in v;
          const videoReady = !!v && vw > 0 && vh > 0 && (!isVideo || (v as HTMLVideoElement).readyState >= 2);
          
          ctx.globalAlpha = alpha;
          if (wantsVideo && videoReady) {
            try {
              const bleed = blurVal > 0 ? blurVal * 2 : 0;
              const targetW = box.w + bleed * 2;
              const targetH = box.h + bleed * 2;

              const tZoom = applyTransform ? transform.zoom : 1;
              const tPanX = applyTransform ? transform.x : 0;
              const tPanY = applyTransform ? transform.y : 0;

              let scale = Math.max(targetW / vw, targetH / vh) * (settings.kenBurns ? 1 + Math.sin(t * 0.05) * 0.05 + 0.05 : 1);
              scale *= tZoom;

              const dw = vw * scale;
              const dh = vh * scale;
              
              let dx = box.x - bleed + (targetW - dw) / 2;
              let dy = box.y - bleed + (targetH - dh) / 2;

              dx += (tPanX / 100) * (dw / 2);
              dy += (tPanY / 100) * (dh / 2);

              if (blurVal > 0) {
                drawBlurred(ctx, v as CanvasImageSource, dx, dy, dw, dh, blurVal);
              } else {
                ctx.drawImage(v as CanvasImageSource, dx, dy, dw, dh);
              }
            } catch {
              if (alpha === 1) {
                ctx.fillStyle = "#0B0F0E";
                ctx.fillRect(box.x, box.y, box.w, box.h);
              }
            }
          } else if (activeTheme?.generated && !settings.customBg) {
            ctx.save();
            ctx.translate(box.x, box.y);
            drawGeneratedBg(ctx, activeTheme.generated, box.w, box.h, t);
            ctx.restore();
          } else {
            if (alpha === 1) {
              ctx.fillStyle = "#0B0F0E";
              ctx.fillRect(box.x, box.y, box.w, box.h);
            }
          }
          ctx.globalAlpha = 1.0;
        };

        // 1. Draw full screen background only for blurred frames
        if (settings.frame === "blurred-glass" || settings.frame === "blurred-glass-square") {
          const fullBox = { x: 0, y: 0, w, h };
          
          if (isTransitioning) {
            drawMedia(vPrev, 1, fullBox, 40, false);
            drawMedia(vCurrent, crossfadeProgress, fullBox, 40, false);
          } else {
            drawMedia(vCurrent, 1, fullBox, 40, false);
          }
          
          // Darken the blurred background
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(0, 0, w, h);
        }

        // 2. Setup clip box for the main media
        ctx.save();
        if (settings.frame === "rounded" || settings.frame === "blurred-glass" || settings.frame === "rounded-square" || settings.frame === "blurred-glass-square") {
          const r = Math.min(w, h) * 0.05;
          ctx.beginPath();
          ctx.moveTo(clipBox.x + r, clipBox.y);
          ctx.lineTo(clipBox.x + clipBox.w - r, clipBox.y);
          ctx.quadraticCurveTo(clipBox.x + clipBox.w, clipBox.y, clipBox.x + clipBox.w, clipBox.y + r);
          ctx.lineTo(clipBox.x + clipBox.w, clipBox.y + clipBox.h - r);
          ctx.quadraticCurveTo(clipBox.x + clipBox.w, clipBox.y + clipBox.h, clipBox.x + clipBox.w - r, clipBox.y + clipBox.h);
          ctx.lineTo(clipBox.x + r, clipBox.y + clipBox.h);
          ctx.quadraticCurveTo(clipBox.x, clipBox.y + clipBox.h, clipBox.x, clipBox.y + clipBox.h - r);
          ctx.lineTo(clipBox.x, clipBox.y + r);
          ctx.quadraticCurveTo(clipBox.x, clipBox.y, clipBox.x + r, clipBox.y);
          ctx.closePath();
          ctx.clip();
        } else if (settings.frame === "arch") {
          ctx.beginPath();
          ctx.moveTo(clipBox.x, clipBox.y + clipBox.w / 2);
          ctx.arc(clipBox.x + clipBox.w / 2, clipBox.y + clipBox.w / 2, clipBox.w / 2, Math.PI, 0);
          ctx.lineTo(clipBox.x + clipBox.w, clipBox.y + clipBox.h);
          ctx.lineTo(clipBox.x, clipBox.y + clipBox.h);
          ctx.closePath();
          ctx.clip();
        }

        // 3. Draw main media inside clip box (this is the bright, clear "window")
        if (isTransitioning) {
          drawMedia(vPrev, 1, clipBox, settings.blur, true);
          drawMedia(vCurrent, crossfadeProgress, clipBox, settings.blur, true);
        } else {
          drawMedia(vCurrent, 1, clipBox, settings.blur, true);
        }

        // 4. Apply overlays inside clip box
        if (settings.overlayDarkness > 0) {
          ctx.fillStyle = `rgba(0,0,0,${settings.overlayDarkness})`;
          ctx.fillRect(clipBox.x, clipBox.y, clipBox.w, clipBox.h);
        }
        if (settings.vignette) {
          const vig = getVignette(clipBox.w, clipBox.h);
          if (vig) ctx.drawImage(vig, clipBox.x, clipBox.y, clipBox.w, clipBox.h);
        }
        if (settings.grain) {
          const tile = getGrainTile();
          const pat = tile ? ctx.createPattern(tile, "repeat") : null;
          if (pat) {
            // Jitter the tile origin each frame so the grain still shimmers.
            const ox = Math.floor(Math.random() * GRAIN_TILE);
            const oy = Math.floor(Math.random() * GRAIN_TILE);
            ctx.save();
            ctx.translate(-ox, -oy);
            ctx.fillStyle = pat;
            ctx.fillRect(clipBox.x + ox, clipBox.y + oy, clipBox.w, clipBox.h);
            ctx.restore();
          }
        }
        
        ctx.restore();
        if (settings.frame === "gold-thin") {
          ctx.strokeStyle = "#C9A227";
          ctx.lineWidth = Math.max(2, w * 0.006);
          const m = w * 0.03;
          ctx.strokeRect(m, m, w - m * 2, h - m * 2);
        }
        // Free users must show a watermark, but can still customize text/position.
        // Pro users can hide it entirely or use a logo.
        const pro = isProNow();
        const userWm = settings.watermark;
        const wm = pro
          ? userWm
          : {
              type: "text" as const,
              text:
                userWm.type === "text" && userWm.text.trim()
                  ? userWm.text
                  : "QuranReels",
              position: userWm.position,
            };
        if (wm.type !== "none") {
          const label = wm.type === "logo" ? "QuranReels" : wm.text || "";
          if (label) {
            ctx.font = `${Math.round(w * 0.022)}px Inter, sans-serif`;
            ctx.fillStyle = pro ? "rgba(245,241,232,0.6)" : "rgba(245,241,232,0.85)";
            ctx.textAlign = "left";
            const pad = w * 0.04;
            const tx =
              wm.position === "tl" || wm.position === "bl"
                ? pad
                : w - pad - ctx.measureText(label).width;
            const ty =
              wm.position === "tl" || wm.position === "tr" ? pad + 20 : h - pad;
            ctx.fillText(label, tx, ty);
          }
        }
        drawText(ctx, settings, verses, segments, textAlpha, segIdx, w, h);
      },
      [settings, verses, segments],
    );

    // rAF render loop — time derived from AudioContext for perfect sync
    useEffect(() => {
      const loop = () => {
        let t = localTimeRef.current;
        let idx = currentSegIdxRef.current;
        
        if (playing && reciterAudioRef.current && segments.length) {
          const first = segments[0];
          const last = segments[segments.length - 1];
          const cTime = reciterAudioRef.current.currentTime;
          
          t = cTime - first.absoluteStart;

          const reciterGain = getReciterGain();
          if (cTime >= last.absoluteEnd) {
             const overage = (cTime - last.absoluteEnd);
             reciterGain.gain.value = Math.max(0, 1.0 - (overage / 0.8));
          } else {
             reciterGain.gain.value = 1;
          }

          // Stop if reached the end of the total video duration (including padding)
          if (t >= duration) {
            reciterAudioRef.current.pause();
            ambientRef.current?.pause();
            setPlaying(false);
            t = duration;
            reciterGain.gain.value = 1;
          }

          // Find current segment index based on absolute time
          idx = segments.findIndex(sg => cTime >= sg.absoluteStart && cTime < sg.absoluteEnd);
          if (idx === -1) {
            // fallback if drifting
            idx = cTime >= last.absoluteEnd ? segments.length - 1 : 0;
          }
        }
        
        currentSegIdxRef.current = idx;
        localTimeRef.current = t;
        draw(t, idx);
        onProgress?.(t, duration);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [draw, playing, duration, onProgress, segments, settings.audioSpeed]);

    useImperativeHandle(
      ref,
      () => ({
        play: async () => {
          if (!segments.length) return;
          const ctx = getAudioCtx();
          if (ctx.state === "suspended") await ctx.resume();

          if (ambientRef.current) connectAmbientToCtx(ambientRef.current);
          if (reciterAudioRef.current) {
            connectReciterToCtx(reciterAudioRef.current);
            reciterAudioRef.current.playbackRate = settings.audioSpeed;
          }

          // Schedule audio fade-out for preview
          const masterGain = getMasterGain();
          const realDuration = duration / settings.audioSpeed;
          masterGain.gain.cancelScheduledValues(ctx.currentTime);
          masterGain.gain.setValueAtTime(1, ctx.currentTime);
          if (realDuration > 1.0) {
            masterGain.gain.setValueAtTime(1, ctx.currentTime + realDuration - 1.0);
            masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + realDuration);
          }

          const first = segments[0];
          let resumeTime = first.absoluteStart;
          
          const t = localTimeRef.current;
          const resuming = t > 0.05 && t < duration - 0.05;
          if (resuming) {
            resumeTime = first.absoluteStart + t;
          } else {
            localTimeRef.current = 0;
            currentSegIdxRef.current = 0;
          }

          if (reciterAudioRef.current) {
            reciterAudioRef.current.currentTime = resumeTime;
            reciterAudioRef.current.play().catch(e => console.warn("reciter play error", e));
          }
          ambientRef.current?.play().catch(() => {});
          setPlaying(true);
        },
        pause: () => {
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
          }
          reciterAudioRef.current?.pause();
          ambientRef.current?.pause();
          const masterGain = getMasterGain();
          masterGain.gain.cancelScheduledValues(getAudioCtx().currentTime);
          masterGain.gain.value = 1;
          setPlaying(false);
        },
        seek: (t) => {
          const clamped = Math.max(0, Math.min(t, duration));
          if (!segments.length) {
            localTimeRef.current = clamped;
            return;
          }
          
          localTimeRef.current = clamped;
          const targetAbsTime = segments[0].absoluteStart + clamped;
          
          if (reciterAudioRef.current) {
            reciterAudioRef.current.currentTime = targetAbsTime;
          }

          let idx = segments.findIndex(sg => targetAbsTime >= sg.absoluteStart && targetAbsTime < sg.absoluteEnd);
          if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
          currentSegIdxRef.current = idx;
        },
        getDuration: () => duration / settings.audioSpeed,
        getCanvas: () => canvasRef.current,
        getAudioElement: () => ambientRef.current,
        getAudioElements: () => [reciterAudioRef.current, ambientRef.current].filter(Boolean) as HTMLAudioElement[],
        getAudioContext: () => getAudioCtx(),
        getAudioDestination: () => getAudioDest(),
        getMasterGain: () => getMasterGain(),
        getReciterGain: () => getReciterGain(),
        getSegmentTimings: () => segments,
        getCurrentTime: () => localTimeRef.current,
        muteSpeakers: (muted: boolean) => setSpeakerMuted(muted),
        drawFrame: async (t: number, isExporting?: boolean) => {
          const clamped = Math.max(0, Math.min(t, duration));
          const targetAbsTime = segments[0]?.start + clamped; // use start instead of absoluteStart which doesn't exist on PreviewHandle type
          let idx = segments.findIndex(sg => targetAbsTime >= sg.start && targetAbsTime < (sg.start + sg.duration));
          if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
          
          const currentAyah = segments[idx]?.verse_key?.split(":")[1] || "global";
          let activeBg = bgMediaRef.current[currentAyah] || bgMediaRef.current["global"];
          
          if (activeBg instanceof HTMLVideoElement) {
            const v = activeBg;
            if (isExporting) {
              v.pause(); // Crucial to prevent decoder artifacts
              await seekVideoFrame(v, loopedTime(v, clamped));
            } else if (v.paused) {
              v.play().catch(() => {});
            }
          }
          draw(clamped, idx);
        },
        captureThumbnail: async () => {
          if (!segments.length) return null;
          const thumbTime = Math.min(0.5, duration / 2);
          const clamped = Math.max(0, Math.min(thumbTime, duration));
          const targetAbsTime = segments[0]?.absoluteStart + clamped;
          let idx = segments.findIndex(sg => targetAbsTime >= sg.absoluteStart && targetAbsTime < sg.absoluteEnd);
          if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
          
          const currentAyah = segments[idx]?.verse_key?.split(":")[1] || "global";
          let activeBg = bgMediaRef.current[currentAyah] || bgMediaRef.current["global"];

          if (activeBg instanceof HTMLVideoElement) {
            await seekVideoFrame(activeBg, loopedTime(activeBg, clamped));
          }
          draw(clamped, idx);
          
          const canvas = canvasRef.current;
          if (!canvas) return null;
          return canvas.toDataURL("image/jpeg", 0.9);
        }
      }),
      [segments, duration, settings.audioSpeed, playing, draw],
    );

    const { w, h } = getDims(settings);
    return (
      <div
        className="relative mx-auto flex h-full max-h-[40vh] items-center justify-center lg:max-h-[70vh]"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded-xl bg-black shadow-2xl"
          aria-label="Video preview"
        />
        <audio ref={reciterAudioRef} crossOrigin="anonymous" preload="auto" />
        <audio ref={ambientRef} crossOrigin="anonymous" preload="auto" loop />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-sm text-muted-foreground">
            Loading recitation…
          </div>
        )}
        {ready && segments.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 p-4 text-center text-sm text-muted-foreground">
            No audio available for this selection — try another reciter.
          </div>
        )}
      </div>
    );
  },
);

function drawGeneratedBg(
  ctx: CanvasRenderingContext2D,
  g: GeneratedTheme,
  w: number,
  h: number,
  t: number,
) {
  switch (g.type) {
    case "solid": {
      ctx.fillStyle = g.color;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "gradient": {
      const gr = ctx.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, g.from);
      gr.addColorStop(1, g.to);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "particles": {
      ctx.fillStyle = g.bg;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = (i * 137 + t * 20) % w;
        const y = (i * 91 + t * 10) % h;
        const r = (g.size ?? 1) + (i % 4);
        ctx.globalAlpha = 0.25 + (i % 5) * 0.1;
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "bokeh": {
      ctx.fillStyle = g.bg;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        const x = (i * 251 + t * 12) % (w + 200) - 100;
        const y = (i * 173 + t * 6) % h;
        const r = w * (0.03 + (i % 5) * 0.015);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `${g.color}55`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "pattern": {
      ctx.fillStyle = g.bg;
      ctx.fillRect(0, 0, w, h);
      const cs = w / 6;
      ctx.strokeStyle = g.fg;
      ctx.lineWidth = Math.max(1, w * 0.0015);
      ctx.globalAlpha = 0.18;
      for (let ry = -1; ry <= Math.ceil(h / cs); ry++) {
        for (let cx = -1; cx <= 6; cx++) {
          const px = cx * cs + cs / 2;
          const py = ry * cs + cs / 2;
          ctx.save();
          ctx.translate(px, py);
          ctx.strokeRect(-cs * 0.32, -cs * 0.32, cs * 0.64, cs * 0.64);
          ctx.rotate(Math.PI / 4);
          ctx.strokeRect(-cs * 0.32, -cs * 0.32, cs * 0.64, cs * 0.64);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
}

/** Fade in at the start of a verse and out at its end. */
function textAlphaFor(
  seg: Segment | undefined,
  t: number,
  animationSpeed: number,
): number {
  if (!seg) return 1;
  const inSeg = Math.max(0, t - seg.start);
  const speed = 0.4 / animationSpeed;
  let alpha = Math.min(1, inSeg / speed);
  if (seg.duration - inSeg < speed) {
    // fade completely out during padding
    alpha = Math.max(0, (seg.duration - inSeg) / speed);
  }
  return alpha;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  s: ProjectSettings,
  verses: Verse[],
  segments: Segment[],
  alpha: number,
  segIdx: number,
  w: number,
  h: number,
) {
  if (alpha <= 0) return;

  const selected = verses.filter(
    (v) => v.verse_number >= s.fromAyah && v.verse_number <= s.toAyah,
  );
  if (!selected.length) return;

  const seg = segments.length
    ? segments[Math.min(segIdx, segments.length - 1)]
    : undefined;
  const currentVerse =
    (seg && selected.find((v) => v.verse_key === seg.verse_key)) ?? selected[0];

  const layer = getTextLayer(s, currentVerse, w, h);
  if (!layer) return;

  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;
}

/**
 * Text is identical for every frame of a verse, so paint it once into an
 * offscreen layer and reuse it. Only the fade alpha varies per frame, and
 * that is applied at blit time by the caller.
 */
function getTextLayer(
  s: ProjectSettings,
  verse: Verse,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const translation =
    verse.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "";

  const key = [
    verse.verse_key,
    w,
    h,
    s.layout,
    s.platformStyle,
    s.maxWidthPct,
    s.textPanX || 0,
    s.textPanY || 0,
    s.textZoom || 1,
    s.textColor,
    s.textShadow ? 1 : 0,
    s.arabicFont,
    s.arabicSize,
    s.lineHeight,
    s.showAyahNumber ? 1 : 0,
    s.ayahNumberStyle,
    s.translationId,
    translation.length,
  ].join("|");

  const cached = _textLayers.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const lctx = canvas.getContext("2d");
  if (!lctx) return null;
  paintTextLayer(lctx, s, verse, translation, w, h);

  // Each layer is a full-resolution RGBA canvas, so keep only a handful.
  if (_textLayers.size >= TEXT_LAYER_CACHE_MAX) {
    const oldest = _textLayers.keys().next();
    if (!oldest.done) _textLayers.delete(oldest.value);
  }
  _textLayers.set(key, canvas);
  return canvas;
}

function paintTextLayer(
  ctx: CanvasRenderingContext2D,
  s: ProjectSettings,
  currentVerse: Verse,
  translation: string,
  w: number,
  h: number,
) {
  let arabic = currentVerse.text_uthmani;

  if (s.showAyahNumber) {
    const num = currentVerse.verse_number.toString().replace(/[0-9]/g, (w) => "٠١٢٣٤٥٦٧٨٩"[+w]);
    if (s.ayahNumberStyle === "ornate") {
      // Use the Arabic ornate bracket (U+06DD) followed by the digits
      arabic = `${arabic} \u06DD${num}`;
    } else if (s.ayahNumberStyle === "bracket") {
      arabic = `${arabic} ﴾${num}﴿`;
    } else {
      arabic = `${arabic} ${num}`;
    }
  }

  let maxW = w * (s.maxWidthPct / 100);
  const centerX = w / 2 + ((s.textPanX || 0) / 100) * w;
  let baseY = h / 2;
  if (s.layout === "bottom-third") {
    baseY = h * 0.72;
    if (s.platformStyle === "tiktok" || s.platformStyle === "instagram") {
      baseY = h * 0.8;
      maxW = Math.min(maxW, w * 0.75); // Leave right side free for icons
    } else if (s.platformStyle === "youtube") {
      baseY = h * 0.76;
    }
  } else if (s.layout === "split") {
    baseY = h * 0.35;
  }
  baseY += ((s.textPanY || 0) / 100) * h;

  const arabicFont = ARABIC_FONTS.find((f) => f.id === s.arabicFont)?.css ?? "'Amiri', serif";
  const sizeScale = w / 1080;

  ctx.save();
  const textZoom = s.textZoom || 1;
  if (textZoom !== 1) {
    ctx.translate(centerX, baseY);
    ctx.scale(textZoom, textZoom);
    ctx.translate(-centerX, -baseY);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = s.textColor;
  if (s.textShadow) {
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 12 * sizeScale;
    ctx.shadowOffsetY = 2;
  }

  // Shrink-to-fit search. This now runs once per verse rather than per frame.
  let arSize = s.arabicSize * sizeScale;
  const minSize = s.arabicSize * sizeScale * 0.35;
  let arLines: string[] = [];
  let arLineH = 0;
  for (;;) {
    ctx.font = `700 ${arSize}px ${arabicFont}`;
    arLines = wrapText(ctx, arabic, maxW);
    arLineH = arSize * s.lineHeight;
    const lineOK = arLines.length <= 4 || arSize <= minSize;
    const heightOK = arLines.length * arLineH <= h * 0.55 || arSize <= 14;
    if (lineOK && heightOK) break;
    arSize *= 0.92;
  }

  const arTotalH = arLines.length * arLineH;
  let y = baseY - arTotalH / 2;
  arLines.forEach((line) => {
    ctx.fillText(line, centerX, y);
    y += arLineH;
  });

  if (s.layout !== "arabic-only" && translation && s.translationId) {
    ctx.shadowBlur = 8 * sizeScale;
    const trSize = Math.max(arSize * 0.42, 14);
    ctx.font = `500 ${trSize}px Inter, sans-serif`;
    ctx.fillStyle = s.textColor;
    const trY = s.layout === "split" ? h * 0.7 : y + arLineH * 0.4;
    const trLines = wrapText(ctx, translation, maxW);
    const trLineH = trSize * 1.4;
    let ty = trY;
    trLines.forEach((line) => {
      ctx.fillText(line, centerX, ty);
      ty += trLineH;
    });
  }

  ctx.font = `600 ${Math.max(arSize * 0.28, 14)}px Inter, sans-serif`;
  ctx.fillStyle = "#C9A227";
  const refKey = currentVerse.verse_key ?? "";
  if (refKey) ctx.fillText(`— ${refKey} —`, centerX, h * 0.88);

  ctx.shadowBlur = 0;
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export { getDims };
