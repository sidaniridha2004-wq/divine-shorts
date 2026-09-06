import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";
import type { ProjectSettings } from "@/lib/project-state";
import type { ExportProgress, ExportResult } from "./webcodecs-export";
import { renderExportAudio } from "./audio-mix";
import { bounded, throwIfAborted } from "./runtime";
export type { ExportProgress } from "./webcodecs-export";

const MIME_CANDIDATES = [
  { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];

/** Real-time fallback with its own audio clock and explicitly requested frames. */
export async function exportVideo(preview: PreviewHandle, onProgress: (p: ExportProgress) => void, settings: ProjectSettings, signal?: AbortSignal): Promise<ExportResult> {
  throwIfAborted(signal);
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support video export.");
  const chosen = MIME_CANDIDATES.find(item => MediaRecorder.isTypeSupported(item.mime));
  if (!chosen) throw new Error("No supported recording codec. Try the latest Chrome or Edge.");
  const duration = preview.getDuration();
  const canvas = preview.getCanvas();
  if (!canvas || !(duration > 0) || !Number.isFinite(duration)) throw new Error("Preview is not ready.");
  if (document.hidden) throw new Error("Keep this tab visible while recording.");
  preview.pause();
  onProgress({ phase: "audio", progress: 0.02, message: "Preparing compatibility audio…" });
  // Match the MP4 mix. The preview playhead is in source-timeline seconds and
  // cannot be compared directly to wall-clock duration at 0.75x speed.
  const audio = await renderExportAudio(preview, settings, duration, signal);
  await bounded(preview.drawFrame(0, true), "Preparing first frame", signal);
  const ctx = preview.getAudioContext();
  if (!ctx) throw new Error("Audio is not available.");
  await bounded(ctx.resume(), "Starting audio", signal);
  const width = canvas.width, height = canvas.height;
  const videoStream = canvas.captureStream(0);
  const track = videoStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  if (!track || typeof track.requestFrame !== "function") {
    videoStream.getTracks().forEach(item => item.stop());
    throw new Error("This browser cannot capture video frames reliably. Try Chrome or Edge.");
  }
  const destination = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = audio; source.connect(destination);
  const stream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  let recorder: MediaRecorder | undefined;
  const chunks: Blob[] = [];
  let recorderError: Error | null = null;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: chosen.mime,
      videoBitsPerSecond: Math.round(Math.min(24_000_000, Math.max(2_500_000, width * height * 30 * 0.12))),
      audioBitsPerSecond: 192_000,
    });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>(resolve => { recorder!.onstop = () => resolve(); });
    recorder.onerror = () => { recorderError = new Error("Recording failed. Please try another browser."); };
    recorder.start(500); track.requestFrame();
    const start = ctx.currentTime;
    source.start(start);
    let frame = 0;
    const wallStart = performance.now();
    while (true) {
      throwIfAborted(signal);
      if (recorderError) throw recorderError;
      if (recorder.state !== "recording") throw new Error("Recording stopped unexpectedly.");
      if (document.hidden) throw new Error("Recording interrupted because the tab was hidden. Keep it visible and retry.");
      if (ctx.state !== "running") throw new Error("Audio was suspended. Keep the app active and retry.");
      if (canvas.width !== width || canvas.height !== height) throw new Error("The video size changed during export. Please retry.");
      const elapsed = ctx.currentTime - start;
      if (elapsed >= duration) break;
      if ((performance.now() - wallStart) / 1000 > duration + 10) throw new Error("Recording stalled. Please retry.");
      const next = Math.floor(elapsed * 30);
      if (next !== frame) {
        frame = next;
        const before = ctx.currentTime;
        await bounded(preview.drawFrame(elapsed * settings.audioSpeed, true), "Recording frame", signal, 10_000);
        if (ctx.currentTime - before > 0.5) throw new Error("The background is too slow to record in real time. Try 720p or a still background.");
        track.requestFrame();
      }
      onProgress({ phase: "recording", progress: 0.1 + 0.85 * elapsed / duration, message: "Recording — keep this tab visible…" });
      await bounded(new Promise(resolve => setTimeout(resolve, 16)), "Recording", signal);
    }
    recorder.stop();
    await bounded(stopped, "Finishing recording", signal, 10_000);
    if (recorderError) throw recorderError;
    throwIfAborted(signal);
    const mime = recorder.mimeType || chosen.mime;
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) throw new Error("The recorder produced an empty file.");
    onProgress({ phase: "done", progress: 1, message: "Done" });
    return { blob, ext: chosen.ext, mime };
  } finally {
    if (recorder?.state !== "inactive") { try { recorder?.stop(); } catch { /* Already stopped. */ } }
    try { source.stop(); } catch { /* Not started. */ }
    source.disconnect();
    // These tracks belong only to this export, not the shared preview destination.
    stream.getTracks().forEach(item => item.stop());
    preview.pause(); preview.muteSpeakers(false);
  }
}
