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

// ── Singleton AudioContext ──────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
let _audioDest: MediaStreamAudioDestinationNode | null = null;
let _masterGain: GainNode | null = null;
let _speakerGain: GainNode | null = null;

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
    _audioDest = _audioCtx.createMediaStreamDestination();
    _masterGain = _audioCtx.createGain();
    _speakerGain = _audioCtx.createGain();
    
    _masterGain.connect(_speakerGain);
    _speakerGain.connect(_audioCtx.destination);
    
    _masterGain.connect(_audioDest);
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
  return _audioCtx;
}
function getAudioDest() { getAudioCtx(); return _audioDest!; }
function getMasterGain() { getAudioCtx(); return _masterGain!; }
function setSpeakerMuted(muted: boolean) {
  if (_speakerGain) _speakerGain.gain.value = muted ? 0 : 1;
}

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
    src.connect(getMasterGain());
  } catch (e) {
    console.warn("reciter connect failed", e);
  }
}

export const PreviewCanvas = forwardRef<PreviewHandle, { onProgress?: (t: number, d: number) => void }>(
  function PreviewCanvas({ onProgress }, ref) {
    const { settings } = useProjectState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
    const reciterAudioRef = useRef<HTMLAudioElement>(null);
    const ambientRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number | null>(null);
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
      const theme = THEMES.find((t) => t.id === settings.themeId);
      videoRef.current = null;

      const loadImage = (src: string) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (!videoRef.current || !(videoRef.current instanceof HTMLVideoElement)) {
            (videoRef as any).current = img;
          }
        };
        img.src = src;
      };

      const loadVideo = (src: string) => {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.onloadeddata = () => {
          videoRef.current = v;
          v.play().catch(() => {});
        };
        v.onerror = () => {};
        v.src = src;
      };

      if (settings.customBg) {
        if (settings.customBg.startsWith("data:video") || /\.(mp4|webm|mov)/i.test(settings.customBg)) {
          loadVideo(settings.customBg);
        } else {
          loadImage(settings.customBg);
        }
      } else if (theme?.poster) {
        loadImage(theme.poster);
        if (theme.video) loadVideo(theme.video);
      }
    }, [settings.themeId, settings.customBg]);

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
        }
        const theme = THEMES.find((th) => th.id === settings.themeId);
        const v = videoRef.current as HTMLVideoElement | HTMLImageElement | null;
        const vw = ((v as any)?.videoWidth ?? (v as HTMLImageElement)?.naturalWidth ?? 0) as number;
        const vh = ((v as any)?.videoHeight ?? (v as HTMLImageElement)?.naturalHeight ?? 0) as number;
        const isVideo = v && 'readyState' in v;
        const videoReady = !!v && vw > 0 && vh > 0 && (!isVideo || (v as HTMLVideoElement).readyState >= 2);
        const wantsVideo = !!settings.customBg || !!theme?.video;
        if (wantsVideo && videoReady) {
          try {
            const scale = Math.max(w / vw, h / vh) * (settings.kenBurns ? 1 + Math.sin(t * 0.05) * 0.05 + 0.05 : 1);
            const dw = vw * scale;
            const dh = vh * scale;
            const dx = (w - dw) / 2;
            const dy = (h - dh) / 2;
            if (settings.blur > 0) ctx.filter = `blur(${settings.blur}px)`;
            ctx.drawImage(v as CanvasImageSource, dx, dy, dw, dh);
            ctx.filter = "none";
          } catch {
            ctx.fillStyle = "#0B0F0E";
            ctx.fillRect(0, 0, w, h);
          }
        } else if (theme?.generated && !settings.customBg) {
          drawGeneratedBg(ctx, theme.generated, w, h, t);
        } else {
          ctx.fillStyle = "#0B0F0E";
          ctx.fillRect(0, 0, w, h);
        }
        if (settings.overlayDarkness > 0) {
          ctx.fillStyle = `rgba(0,0,0,${settings.overlayDarkness})`;
          ctx.fillRect(0, 0, w, h);
        }
        if (settings.vignette) {
          const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, "rgba(0,0,0,0.65)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
        if (settings.grain) {
          for (let i = 0; i < 400; i++) {
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
          }
        }
        if (settings.frame === "gold-thin") {
          ctx.strokeStyle = "#C9A227";
          ctx.lineWidth = Math.max(2, w * 0.006);
          const m = w * 0.03;
          ctx.strokeRect(m, m, w - m * 2, h - m * 2);
        }
        if (settings.watermark.type !== "none") {
          const label =
            settings.watermark.type === "logo" ? "QuranReels" : settings.watermark.text || "";
          if (label) {
            ctx.font = `${Math.round(w * 0.022)}px Inter, sans-serif`;
            ctx.fillStyle = "rgba(245,241,232,0.6)";
            ctx.textAlign = "left";
            const pad = w * 0.04;
            const tx =
              settings.watermark.position === "tl" || settings.watermark.position === "bl"
                ? pad
                : w - pad - ctx.measureText(label).width;
            const ty =
              settings.watermark.position === "tl" || settings.watermark.position === "tr"
                ? pad + 20
                : h - pad;
            ctx.fillText(label, tx, ty);
          }
        }
        drawText(ctx, settings, verses, segments, t, segIdx, w, h);
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

          // Stop if reached the end of the last segment
          if (cTime >= last.absoluteEnd) {
            reciterAudioRef.current.pause();
            ambientRef.current?.pause();
            setPlaying(false);
            t = duration;
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
        getSegmentTimings: () => segments,
        getCurrentTime: () => localTimeRef.current,
        muteSpeakers: (muted: boolean) => setSpeakerMuted(muted),
        drawFrame: async (t: number, isExporting?: boolean) => {
          const clamped = Math.max(0, Math.min(t, duration));
          const targetAbsTime = segments[0]?.start + clamped; // use start instead of absoluteStart which doesn't exist on PreviewHandle type
          let idx = segments.findIndex(sg => targetAbsTime >= sg.start && targetAbsTime < (sg.start + sg.duration));
          if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
          
          if (videoRef.current instanceof HTMLVideoElement) {
            const v = videoRef.current;
            if (isExporting) {
              if (v.readyState > 0) {
                v.pause(); // Crucial to prevent decoder artifacts
                const targetTime = clamped % v.duration;
                if (Math.abs(v.currentTime - targetTime) > 0.05) {
                  v.currentTime = targetTime;
                  await new Promise<void>(r => {
                    let fired = false;
                    const done = () => { if (!fired) { fired = true; r(); } };
                    v.addEventListener("seeked", () => {
                      if ('requestVideoFrameCallback' in v) {
                        (v as any).requestVideoFrameCallback(done);
                      } else {
                        done();
                      }
                    }, { once: true });
                    setTimeout(done, 1500);
                  });
                }
              }
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
          
          if (videoRef.current instanceof HTMLVideoElement) {
            const v = videoRef.current;
            if (v.readyState > 0) {
              v.currentTime = clamped % v.duration;
              await new Promise<void>(r => {
                let fired = false;
                const done = () => { if (!fired) { fired = true; r(); } };
                v.addEventListener("seeked", () => {
                  if ('requestVideoFrameCallback' in v) {
                    (v as any).requestVideoFrameCallback(done);
                  } else {
                    done();
                  }
                }, { once: true });
                setTimeout(done, 1500);
              });
            }
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

function drawText(
  ctx: CanvasRenderingContext2D,
  s: ProjectSettings,
  verses: Verse[],
  segments: Segment[],
  t: number,
  segIdx: number,
  w: number,
  h: number,
) {
  const selected = verses.filter(
    (v) => v.verse_number >= s.fromAyah && v.verse_number <= s.toAyah,
  );
  if (!selected.length) return;

  const seg = segments.length
    ? segments[Math.min(segIdx, segments.length - 1)]
    : undefined;
  const currentVerse =
    (seg && selected.find((v) => v.verse_key === seg.verse_key)) ?? selected[0];
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

  const translation =
    currentVerse.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "";

  let maxW = w * (s.maxWidthPct / 100);
  const centerX = w / 2;
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

  let alpha = 1;
  if (seg) {
    const inSeg = Math.max(0, t - seg.start);
    const speed = 0.4 / s.animationSpeed;
    alpha = Math.min(1, inSeg / speed);
    if (seg.duration - inSeg < speed) alpha = Math.max(0, (seg.duration - inSeg) / speed); // fade completely out during padding
  }
  ctx.globalAlpha = alpha;

  const arabicFont = ARABIC_FONTS.find((f) => f.id === s.arabicFont)?.css ?? "'Amiri', serif";
  const sizeScale = w / 1080;
  ctx.textAlign = "center";
  ctx.fillStyle = s.textColor;
  if (s.textShadow) {
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 12 * sizeScale;
    ctx.shadowOffsetY = 2;
  }
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
  ctx.globalAlpha = 1;
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
