// MediaRecorder-based export. Attempts MP4 first (Safari, Chrome recent),
// falls back to WebM. Runs client-side by capturing the canvas stream and
// merging in the sequenced audio segments played through an AudioContext.
import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";

export type ExportProgress = {
  phase: "preparing" | "recording" | "encoding" | "done";
  progress: number; // 0..1
  message?: string;
};

const MIME_CANDIDATES = [
  { mime: "video/mp4;codecs=avc1", ext: "mp4" },
  { mime: "video/mp4", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];

let globalAudioCtx: AudioContext | null = null;
let globalDest: MediaStreamAudioDestinationNode | null = null;
const connectedSources = new WeakSet<HTMLAudioElement>();

function getMixer() {
  if (!globalAudioCtx) {
    globalAudioCtx = new AudioContext();
    globalDest = globalAudioCtx.createMediaStreamDestination();
  }
  return { ctx: globalAudioCtx, dest: globalDest! };
}

function connectToMixer(el: HTMLAudioElement) {
  const { ctx, dest } = getMixer();
  if (!connectedSources.has(el)) {
    connectedSources.add(el);
    try {
      const source = ctx.createMediaElementSource(el);
      source.connect(dest);
      source.connect(ctx.destination);
    } catch (e) {
      console.warn("Failed to connect audio element to mixer", e);
    }
  }
  // Ensure the context is running
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

export async function exportVideo(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const canvas = preview.getCanvas();
  const audioEls = preview.getAudioElements ? preview.getAudioElements() : [];
  // Fallback for older code
  if (audioEls.length === 0 && preview.getAudioElement) {
    const a = preview.getAudioElement();
    if (a) audioEls.push(a);
  }
  const segments = preview.getSegmentTimings();
  
  if (!canvas || !audioEls.length || !segments.length)
    throw new Error("Preview not ready");

  onProgress({ phase: "preparing", progress: 0.05, message: "Preparing streams…" });

  const chosen = MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime));
  if (!chosen) throw new Error("No supported video codec in this browser");

  const canvasStream = canvas.captureStream(30);
  
  // Route all audio elements through the persistent context
  audioEls.forEach(connectToMixer);
  const { dest } = getMixer();

  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(combined, {
    mimeType: chosen.mime,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const total = preview.getDuration();
  const donePromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: chosen.mime }));
  });

  recorder.start(500);
  onProgress({ phase: "recording", progress: 0.1, message: "Recording…" });
  preview.seek(0); // always export from the very beginning so the video matches the preview
  await preview.play();

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      const p = Math.min(0.95, 0.1 + (elapsed / total) * 0.85);
      onProgress({ phase: "recording", progress: p });
      if (elapsed >= total + 0.5) {
        clearInterval(iv);
        resolve();
      }
    }, 250);
  });

  recorder.stop();
  preview.pause();
  const blob = await donePromise;
  onProgress({ phase: "done", progress: 1 });
  return { blob, ext: chosen.ext, mime: chosen.mime };
}
