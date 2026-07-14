// MediaRecorder-based export. Captures the canvas stream and merges it with
// the AudioContext's MediaStreamDestination from PreviewCanvas.
// This approach is clean: the preview already routes all audio (recitation +
// ambient) through a single AudioContext → MediaStreamDestination, so we just
// grab that stream and combine it with the canvas video stream.
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

export async function exportVideo(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const canvas = preview.getCanvas();
  const segments = preview.getSegmentTimings();
  if (!canvas || !segments.length)
    throw new Error("Preview not ready");

  onProgress({ phase: "preparing", progress: 0.05, message: "Preparing streams…" });

  const chosen = MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime));
  if (!chosen) throw new Error("No supported video codec in this browser");

  const canvasStream = canvas.captureStream(30);

  // Get the audio destination stream from PreviewCanvas's AudioContext.
  // PreviewCanvas already routes all recitation + ambient audio through this.
  const audioDest = preview.getAudioDestination?.();
  
  let combined: MediaStream;
  if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
    combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ]);
  } else {
    // Fallback: video only (shouldn't happen, but don't crash)
    console.warn("No audio destination available for export");
    combined = canvasStream;
  }

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
  preview.seek(0);
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
