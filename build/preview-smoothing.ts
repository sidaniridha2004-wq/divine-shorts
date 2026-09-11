import type { Plugin } from "vite";

const PREVIEW_HELPER = `
function getPreviewDims(s: ProjectSettings) {
  const full = getDims(s);
  const scale = Math.min(1, 900 / Math.max(full.w, full.h));
  return { w: Math.max(2, Math.round(full.w * scale)), h: Math.max(2, Math.round(full.h * scale)) };
}
`;

const SMOOTH_BLUR = `function drawBlurred(ctx: CanvasRenderingContext2D, src: CanvasImageSource, dx: number, dy: number, dw: number, dh: number, radius: number) {
  // Blur a moderately downscaled surface. The previous 16x nearest-style
  // enlargement exposed large pixels around square/glass frames.
  const factor = Math.min(6, Math.max(2, Math.round(radius / 8)));
  const sw = Math.max(2, Math.round(dw / factor)), sh = Math.max(2, Math.round(dh / factor));
  if (!_blurScratch) _blurScratch = document.createElement("canvas");
  if (_blurScratch.width !== sw || _blurScratch.height !== sh) { _blurScratch.width = sw; _blurScratch.height = sh; }
  const g = _blurScratch.getContext("2d");
  if (!g) { ctx.drawImage(src, dx, dy, dw, dh); return; }
  g.clearRect(0, 0, sw, sh);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  const blur = Math.max(1, radius / factor);
  const bleed = Math.ceil(blur * 2);
  g.filter = \`blur(\${blur}px)\`;
  g.drawImage(src, -bleed, -bleed, sw + bleed * 2, sh + bleed * 2);
  g.filter = "none";
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(_blurScratch, 0, 0, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}`;

const FONT_EFFECT = `
    // Canvas text can otherwise cache a fallback glyph layer before the chosen
    // web font finishes loading. Redraw immediately when the real face is ready.
    useEffect(() => {
      const font = ARABIC_FONTS.find(item => item.id === settings.arabicFont)?.css;
      if (!font || typeof document === "undefined" || !document.fonts) return;
      let alive = true;
      document.fonts.load(\`700 \${settings.arabicSize}px \${font}\`, "بِسْمِ اللَّهِ").then(() => {
        if (!alive) return;
        _textLayers.clear();
        lastSigRef.current = "";
      }).catch(() => {});
      return () => { alive = false; };
    }, [settings.arabicFont, settings.arabicSize]);
`;

export function smoothPreviewSource(code: string): string {
  let next = code;
  const audioMarker = "\n\nlet _audioCtx: AudioContext | null = null;";
  if (!next.includes("function getPreviewDims(")) next = next.replace(audioMarker, PREVIEW_HELPER + audioMarker);

  const drawStart = next.indexOf("function drawBlurred(");
  const drawEnd = next.indexOf("\nlet _vignette:", drawStart);
  if (drawStart < 0 || drawEnd < 0) throw new Error("Preview smoothing: blur renderer marker changed.");
  next = next.slice(0, drawStart) + SMOOTH_BLUR + next.slice(drawEnd);

  const dimsOld = "      const { w, h } = getDims(settings);";
  const dimsNew = "      const { w, h } = exporting ? getDims(settings) : getPreviewDims(settings);";
  if (!next.includes(dimsOld)) throw new Error("Preview smoothing: live-size marker changed.");
  next = next.replace(dimsOld, dimsNew);

  const refMarker = "    const currentSegIdxRef = useRef(0);\n";
  if (!next.includes("Canvas text can otherwise cache")) {
    if (!next.includes(refMarker)) throw new Error("Preview smoothing: font-effect marker changed.");
    next = next.replace(refMarker, refMarker + FONT_EFFECT);
  }

  const textMarker = "  ctx.textAlign = \"center\"; ctx.fillStyle = s.textColor;";
  const textReplacement = textMarker + "\n  if (\"letterSpacing\" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${s.letterSpacing || 0}px`;";
  if (!next.includes(textMarker)) throw new Error("Preview smoothing: text-style marker changed.");
  next = next.replace(textMarker, textReplacement);
  return next;
}

export function previewSmoothingPlugin(): Plugin {
  return {
    name: "divine-shorts-preview-smoothing",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/components/wizard/PreviewCanvas.tsx")) return null;
      return { code: smoothPreviewSource(code), map: null };
    },
  };
}
