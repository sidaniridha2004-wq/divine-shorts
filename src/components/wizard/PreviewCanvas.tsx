import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useProjectState, type ProjectSettings } from "@/lib/project-state";
import { THEMES } from "@/lib/themes";
import { ARABIC_FONTS } from "@/lib/translations";
import { RECITERS } from "@/lib/reciters";
import { getAyahAudioSegments, getVersesByChapter, type Verse } from "@/lib/quran-api";

export type PreviewHandle = {
  play: () => Promise<void>;
  pause: () => void;
  seek: (t: number) => void;
  getDuration: () => number;
  getCanvas: () => HTMLCanvasElement | null;
  getAudioElement: () => HTMLAudioElement | null;
  getSegmentTimings: () => { verse_key: string; start: number; duration: number }[];
};

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

export const PreviewCanvas = forwardRef<PreviewHandle, { onProgress?: (t: number, d: number) => void }>(
  function PreviewCanvas({ onProgress }, ref) {
    const { settings } = useProjectState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number | null>(null);
    const [verses, setVerses] = useState<Verse[]>([]);
    const [segments, setSegments] = useState<
      { verse_key: string; start: number; duration: number; url: string }[]
    >([]);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ready, setReady] = useState(false);
    const startAtRef = useRef(0);
    const localTimeRef = useRef(0);

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

    // Load audio segments when reciter/chapter changes
    useEffect(() => {
      let alive = true;
      setReady(false);
      getAyahAudioSegments(settings.reciterId, settings.chapterId).then((segs) => {
        if (!alive) return;
        const filtered = segs.filter((s) => {
          const [, v] = s.verse_key.split(":").map(Number);
          return v >= settings.fromAyah && v <= settings.toAyah;
        });
        // Assign start times sequentially; use duration from API or estimate 5s
        let t = 0;
        const withTiming = filtered.map((s) => {
          const dur = (s.duration ?? 5000) / 1000 / settings.audioSpeed;
          const entry = { ...s, start: t, duration: dur };
          t += dur;
          return entry;
        });
        setSegments(withTiming);
        setDuration(t);
        setReady(true);
      });
      return () => {
        alive = false;
      };
    }, [settings.reciterId, settings.chapterId, settings.fromAyah, settings.toAyah, settings.audioSpeed]);

    // Load background video
    useEffect(() => {
      const theme = THEMES.find((t) => t.id === settings.themeId);
      if (settings.customBg) {
        if (settings.customBg.startsWith("data:video") || /\.(mp4|webm|mov)/i.test(settings.customBg)) {
          const v = document.createElement("video");
          v.src = settings.customBg;
          v.crossOrigin = "anonymous";
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          videoRef.current = v;
          v.play().catch(() => {});
        } else {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = settings.customBg;
          (videoRef as any).current = img;
        }
      } else if (theme?.video) {
        const v = document.createElement("video");
        v.src = theme.video;
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        videoRef.current = v;
        v.play().catch(() => {});
      } else {
        videoRef.current = null;
      }
    }, [settings.themeId, settings.customBg]);

    const draw = useCallback(
      (t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const { w, h } = getDims(settings);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        // Background
        const theme = THEMES.find((th) => th.id === settings.themeId);
        if (theme?.generated === "dark-gradient") {
          const g = ctx.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, "#0F5132");
          g.addColorStop(1, "#0B0F0E");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        } else if (theme?.generated === "gold-particles") {
          ctx.fillStyle = "#0B0F0E";
          ctx.fillRect(0, 0, w, h);
          for (let i = 0; i < 60; i++) {
            const x = ((i * 137 + t * 20) % w);
            const y = ((i * 91 + t * 10) % h);
            const r = 1 + (i % 4);
            ctx.fillStyle = `rgba(201,162,39,${0.3 + (i % 5) * 0.1})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const v = videoRef.current as HTMLVideoElement | HTMLImageElement | null;
          if (v) {
            try {
              // cover fit with optional Ken Burns
              const vw = (v as any).videoWidth || (v as HTMLImageElement).naturalWidth || w;
              const vh = (v as any).videoHeight || (v as HTMLImageElement).naturalHeight || h;
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
          } else {
            ctx.fillStyle = "#0B0F0E";
            ctx.fillRect(0, 0, w, h);
          }
        }
        // Overlay darkness
        if (settings.overlayDarkness > 0) {
          ctx.fillStyle = `rgba(0,0,0,${settings.overlayDarkness})`;
          ctx.fillRect(0, 0, w, h);
        }
        // Vignette
        if (settings.vignette) {
          const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, "rgba(0,0,0,0.65)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
        // Grain
        if (settings.grain) {
          for (let i = 0; i < 400; i++) {
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
          }
        }
        // Frame decorations
        if (settings.frame === "gold-thin") {
          ctx.strokeStyle = "#C9A227";
          ctx.lineWidth = Math.max(2, w * 0.006);
          const m = w * 0.03;
          ctx.strokeRect(m, m, w - m * 2, h - m * 2);
        }
        // Watermark
        if (settings.watermark.type !== "none") {
          const label =
            settings.watermark.type === "logo" ? "QuranReels" : settings.watermark.text || "";
          if (label) {
            ctx.font = `${Math.round(w * 0.022)}px Inter, sans-serif`;
            ctx.fillStyle = "rgba(245,241,232,0.6)";
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
        // Text
        drawText(ctx, settings, verses, segments, t, w, h);
      },
      [settings, verses, segments],
    );

    // rAF loop
    useEffect(() => {
      const loop = () => {
        const audio = audioRef.current;
        let t = localTimeRef.current;
        if (playing && audio && !audio.paused) t = audio.currentTime;
        localTimeRef.current = t;
        draw(t);
        onProgress?.(t, duration);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [draw, playing, duration, onProgress]);

    // Sequence audio segments
    const currentSegIdxRef = useRef(0);
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const onEnded = () => {
        currentSegIdxRef.current++;
        if (currentSegIdxRef.current < segments.length) {
          const next = segments[currentSegIdxRef.current];
          audio.src = next.url;
          audio.playbackRate = settings.audioSpeed;
          audio.play().catch(() => {});
        } else {
          setPlaying(false);
          currentSegIdxRef.current = 0;
          localTimeRef.current = 0;
        }
      };
      audio.addEventListener("ended", onEnded);
      return () => audio.removeEventListener("ended", onEnded);
    }, [segments, settings.audioSpeed]);

    useImperativeHandle(
      ref,
      () => ({
        play: async () => {
          const audio = audioRef.current;
          if (!audio || !segments.length) return;
          currentSegIdxRef.current = 0;
          audio.src = segments[0].url;
          audio.playbackRate = settings.audioSpeed;
          startAtRef.current = performance.now();
          await audio.play().catch(() => {});
          setPlaying(true);
        },
        pause: () => {
          audioRef.current?.pause();
          setPlaying(false);
        },
        seek: (t) => {
          localTimeRef.current = t;
        },
        getDuration: () => duration,
        getCanvas: () => canvasRef.current,
        getAudioElement: () => audioRef.current,
        getSegmentTimings: () => segments,
      }),
      [segments, duration, settings.audioSpeed],
    );

    const { w, h } = getDims(settings);
    return (
      <div
        className="relative mx-auto flex h-full max-h-full items-center justify-center"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded-xl bg-black shadow-2xl"
          style={{ maxHeight: "70vh" }}
          aria-label="Video preview"
        />
        <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-sm text-muted-foreground">
            Loading recitation…
          </div>
        )}
      </div>
    );
  },
);

function drawText(
  ctx: CanvasRenderingContext2D,
  s: ProjectSettings,
  verses: Verse[],
  segments: { verse_key: string; start: number; duration: number }[],
  t: number,
  w: number,
  h: number,
) {
  const selected = verses.filter(
    (v) => v.verse_number >= s.fromAyah && v.verse_number <= s.toAyah,
  );
  if (!selected.length) return;

  // Determine active verse from time
  const activeSeg = segments.find((sg) => t >= sg.start && t < sg.start + sg.duration);
  const activeKey = activeSeg?.verse_key;

  const arabic = selected
    .filter((v) => !activeKey || v.verse_key === activeKey)
    .map((v) => v.text_uthmani)
    .join("  ");
  const currentVerse = activeKey
    ? selected.find((v) => v.verse_key === activeKey)
    : selected[0];
  const translation =
    currentVerse?.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "";

  // Layout
  const maxW = w * (s.maxWidthPct / 100);
  const centerX = w / 2;
  let baseY = h / 2;
  if (s.layout === "bottom-third") baseY = h * 0.72;
  if (s.layout === "split") baseY = h * 0.35;

  // Fade animation
  let alpha = 1;
  if (activeSeg) {
    const inSeg = t - activeSeg.start;
    const speed = 0.4 / s.animationSpeed;
    alpha = Math.min(1, inSeg / speed);
    if (activeSeg.duration - inSeg < speed) alpha = Math.max(0.2, (activeSeg.duration - inSeg) / speed);
  }
  ctx.globalAlpha = alpha;

  // Arabic text
  const arabicFont = ARABIC_FONTS.find((f) => f.id === s.arabicFont)?.css ?? "'Amiri', serif";
  const sizeScale = w / 1080;
  ctx.textAlign = "center";
  ctx.fillStyle = s.textColor;
  if (s.textShadow) {
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 12 * sizeScale;
    ctx.shadowOffsetY = 2;
  }
  const arSize = s.arabicSize * sizeScale;
  ctx.font = `700 ${arSize}px ${arabicFont}`;
  const arLines = wrapText(ctx, arabic, maxW);
  const arLineH = arSize * s.lineHeight;
  const arTotalH = arLines.length * arLineH;
  let y = baseY - arTotalH / 2;
  arLines.forEach((line) => {
    ctx.fillText(line, centerX, y);
    y += arLineH;
  });

  // Translation
  if (s.layout !== "arabic-only" && translation && s.translationId) {
    ctx.shadowBlur = 8 * sizeScale;
    ctx.font = `500 ${arSize * 0.42}px Inter, sans-serif`;
    ctx.fillStyle = s.textColor;
    const trY = s.layout === "split" ? h * 0.7 : y + arLineH * 0.4;
    const trLines = wrapText(ctx, translation, maxW);
    const trLineH = arSize * 0.42 * 1.4;
    let ty = trY;
    trLines.forEach((line) => {
      ctx.fillText(line, centerX, ty);
      ty += trLineH;
    });
  }

  // Reference
  ctx.font = `600 ${arSize * 0.28}px Inter, sans-serif`;
  ctx.fillStyle = "#C9A227";
  const chapterName = RECITERS.length ? "" : ""; // placeholder to avoid warning
  void chapterName;
  const ref = currentVerse?.verse_key ?? "";
  if (ref) ctx.fillText(`— ${ref} —`, centerX, h * 0.88);

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
