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

type Segment = { verse_key: string; url: string; start: number; duration: number };

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

// Read the real duration of an audio file from its metadata.
// Accurate durations are essential: the text timeline must never drift
// away from the audio (the old 5s estimate caused ayahs to get mixed up).
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
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

export const PreviewCanvas = forwardRef<PreviewHandle, { onProgress?: (t: number, d: number) => void }>(
  function PreviewCanvas({ onProgress }, ref) {
    const { settings } = useProjectState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number | null>(null);
    const [verses, setVerses] = useState<Verse[]>([]);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ready, setReady] = useState(false);
    const localTimeRef = useRef(0);
    // Index of the segment (= ayah) currently playing. The active ayah is
    // always derived from this index — never from wall-clock guesses.
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

    // Load audio segments when reciter/chapter/range changes
    useEffect(() => {
      let alive = true;
      setReady(false);
      setSegments([]);
      setDuration(0);
      (async () => {
        const segs = await getAyahAudioSegments(settings.reciterId, settings.chapterId);
        const filtered = segs
          .filter((s) => {
            const [, v] = s.verse_key.split(":").map(Number);
            return v >= settings.fromAyah && v <= settings.toAyah;
          })
          // Guarantee playback order regardless of API ordering
          .sort(
            (a, b) =>
              Number(a.verse_key.split(":")[1]) - Number(b.verse_key.split(":")[1]),
          );
        // Probe the real duration of every segment so timings are exact.
        const probed = await Promise.all(filtered.map((s) => probeDuration(s.url)));
        if (!alive) return;
        let t = 0;
        const withTiming: Segment[] = filtered.map((s, i) => {
          // API duration is sometimes ms, sometimes seconds, often missing
          const api = s.duration ? (s.duration > 100 ? s.duration / 1000 : s.duration) : null;
          const raw = probed[i] ?? api ?? 5;
          const dur = raw / settings.audioSpeed;
          const entry = { verse_key: s.verse_key, url: s.url, start: t, duration: dur };
          t += dur;
          return entry;
        });
        currentSegIdxRef.current = 0;
        localTimeRef.current = 0;
        setSegments(withTiming);
        setDuration(t);
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
        // Background — prefer the video/image when it's actually loaded,
        // otherwise fall back to the theme's generated gradient (so tiles
        // and preview are never blank while a Pexels asset is loading or blocked).
        const theme = THEMES.find((th) => th.id === settings.themeId);
        const v = videoRef.current as HTMLVideoElement | HTMLImageElement | null;
        const vw = ((v as any)?.videoWidth ?? (v as HTMLImageElement)?.naturalWidth ?? 0) as number;
        const vh = ((v as any)?.videoHeight ?? (v as HTMLImageElement)?.naturalHeight ?? 0) as number;
        const videoReady = !!v && vw > 0 && vh > 0;
        if (videoReady && !(!settings.customBg && theme && !theme.video && theme.generated)) {
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
        // Text
        drawText(ctx, settings, verses, segments, t, segIdx, w, h);
      },
      [settings, verses, segments],
    );

    // rAF render loop. Global time = start of the active segment + position
    // inside it. This is monotonic and can never rewind to a previous ayah
    // (audio.currentTime alone resets per segment — the source of the old bug).
    useEffect(() => {
      const loop = () => {
        const audio = audioRef.current;
        let t = localTimeRef.current;
        const idx = currentSegIdxRef.current;
        const seg = segments[idx];
        if (playing && audio && seg) {
          const inSeg = Math.min(audio.currentTime / settings.audioSpeed, seg.duration);
          t = seg.start + inSeg;
        }
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

    // Sequence audio segments strictly via the 'ended' event
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const onEnded = () => {
        const nextIdx = currentSegIdxRef.current + 1;
        if (nextIdx < segments.length) {
          currentSegIdxRef.current = nextIdx;
          const next = segments[nextIdx];
          localTimeRef.current = next.start;
          audio.src = next.url;
          audio.playbackRate = settings.audioSpeed;
          audio.play().catch(() => {});
        } else {
          // Finished: clean reset so the next play starts from the beginning
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
          const t = localTimeRef.current;
          const resuming = !!audio.src && t > 0.05 && t < duration - 0.05;
          if (!resuming) {
            currentSegIdxRef.current = 0;
            localTimeRef.current = 0;
            audio.src = segments[0].url;
            audio.currentTime = 0;
          }
          audio.playbackRate = settings.audioSpeed;
          await audio.play().catch(() => {});
          setPlaying(true);
        },
        pause: () => {
          audioRef.current?.pause();
          setPlaying(false);
        },
        seek: (t) => {
          const audio = audioRef.current;
          const clamped = Math.max(0, Math.min(t, duration));
          if (!audio || !segments.length) {
            localTimeRef.current = clamped;
            return;
          }
          let idx = segments.findIndex(
            (sg) => clamped >= sg.start && clamped < sg.start + sg.duration,
          );
          if (idx === -1) idx = clamped <= 0 ? 0 : segments.length - 1;
          const seg = segments[idx];
          currentSegIdxRef.current = idx;
          if (audio.src !== seg.url) audio.src = seg.url;
          audio.currentTime = (clamped - seg.start) * settings.audioSpeed;
          localTimeRef.current = clamped;
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

  // Exactly ONE verse is shown at a time — the one whose audio segment is
  // active. Previous verses are never stacked or joined together.
  const seg = segments.length
    ? segments[Math.min(segIdx, segments.length - 1)]
    : undefined;
  const currentVerse =
    (seg && selected.find((v) => v.verse_key === seg.verse_key)) ?? selected[0];
  const arabic = currentVerse.text_uthmani;
  const translation =
    currentVerse.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "";

  // Layout
  const maxW = w * (s.maxWidthPct / 100);
  const centerX = w / 2;
  let baseY = h / 2;
  if (s.layout === "bottom-third") baseY = h * 0.72;
  if (s.layout === "split") baseY = h * 0.35;

  // Fade animation based on position inside the active segment
  let alpha = 1;
  if (seg) {
    const inSeg = Math.max(0, t - seg.start);
    const speed = 0.4 / s.animationSpeed;
    alpha = Math.min(1, inSeg / speed);
    if (seg.duration - inSeg < speed) alpha = Math.max(0.2, (seg.duration - inSeg) / speed);
  }
  ctx.globalAlpha = alpha;

  // Arabic text — auto-fit: shrink until it wraps to ≤ 4 lines and fits
  // vertically inside the safe area (long ayahs like 2:282 stay on screen).
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

  // Translation
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

  // Reference
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
