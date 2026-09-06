import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";
import type { ProjectSettings } from "@/lib/project-state";
import { bounded, throwIfAborted, waitForQueue, MediaExportError } from "./runtime";
import { renderExportAudio } from "./audio-mix";

export type ExportPhase = "preparing" | "audio" | "rendering" | "recording" | "finalizing" | "done";
export type ExportProgress = { phase: ExportPhase; progress: number; message?: string };
export type ExportResult = { blob: Blob; ext: string; mime: string };
const FPS = 30;

export function isWebCodecsExportSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" && typeof AudioData !== "undefined" &&
    typeof OfflineAudioContext !== "undefined";
}

async function pickVideoConfig(width: number, height: number): Promise<VideoEncoderConfig> {
  const bitrate = Math.round(Math.min(24_000_000, Math.max(2_500_000, width * height * FPS * 0.12)));
  for (const codec of ["avc1.640028", "avc1.4D0028", "avc1.42E028"]) {
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
      const config: VideoEncoderConfig = {
        codec, width, height, bitrate, framerate: FPS, hardwareAcceleration,
        latencyMode: "quality", avc: { format: "avc" },
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return support.config ?? config;
      } catch { /* Try the next supported encoder. */ }
    }
  }
  throw new Error("No H.264 encoder is available.");
}

async function drawExportFrame(preview: PreviewHandle, time: number, signal?: AbortSignal): Promise<void> {
  try {
    await bounded(preview.drawFrame(time, true), "Rendering background frame", signal);
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    // Do not start another recorder on a canvas whose frame failed.
    throw new MediaExportError(error instanceof Error ? error.message : "Could not render a frame.");
  }
}

export async function exportVideo(preview: PreviewHandle, onProgress: (p: ExportProgress) => void, settings: ProjectSettings, signal?: AbortSignal): Promise<ExportResult> {
  throwIfAborted(signal);
  const duration = preview.getDuration();
  if (!Number.isFinite(duration) || duration <= 0 || !preview.getSegmentTimings().length) throw new MediaExportError("Wait for the recitation to finish loading before exporting.");
  if (duration > 600) throw new MediaExportError("Select a shorter range (up to 10 minutes) to avoid running out of memory.");
  let ownsCanvas = false;
  try {
    onProgress({ phase: "preparing", progress: 0, message: "Preparing background video…" });
    await preview.beginExport(signal);
    ownsCanvas = true;
    if (isWebCodecsExportSupported()) {
      try { return await encode(preview, onProgress, settings, signal); }
      catch (error) {
        throwIfAborted(signal);
        if (error instanceof MediaExportError) throw error;
        console.warn("[export] MP4 encoder unavailable; trying compatibility mode", error);
      }
    }
    throwIfAborted(signal);
    onProgress({ phase: "preparing", progress: 0, message: "Using compatibility mode. Keep this tab visible…" });
    const { exportVideo: record } = await import("./mediarecorder-export");
    return await record(preview, onProgress, settings, signal);
  } finally {
    if (ownsCanvas) {
      preview.endExport();
      preview.pause();
      preview.muteSpeakers(false);
    }
  }
}

async function encode(preview: PreviewHandle, onProgress: (p: ExportProgress) => void, settings: ProjectSettings, signal?: AbortSignal): Promise<ExportResult> {
  onProgress({ phase: "preparing", progress: 0, message: "Checking export support…" });
  if (typeof document !== "undefined" && document.fonts) await bounded(document.fonts.ready, "Loading fonts", signal);
  await drawExportFrame(preview, 0, signal);
  const canvas = preview.getCanvas();
  if (!canvas || canvas.width < 2 || canvas.height < 2) throw new MediaExportError("Preview canvas is not ready.");
  const rawWidth = canvas.width, rawHeight = canvas.height;
  const width = rawWidth - rawWidth % 2, height = rawHeight - rawHeight % 2;
  const videoConfig = await bounded(pickVideoConfig(width, height), "Checking H.264 support", signal);
  const audioConfig: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 2, bitrate: 192_000 };
  const audioSupport = await bounded(AudioEncoder.isConfigSupported(audioConfig), "Checking AAC support", signal);
  if (!audioSupport.supported) throw new Error("AAC encoding is not supported.");
  onProgress({ phase: "audio", progress: 0.02, message: "Preparing recitation and audio…" });
  const duration = preview.getDuration();
  const audio = await renderExportAudio(preview, settings, duration, signal);
  throwIfAborted(signal);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target, fastStart: "in-memory", firstTimestampBehavior: "offset",
    video: { codec: "avc", width, height },
    audio: { codec: "aac", numberOfChannels: 2, sampleRate: audio.sampleRate },
  });
  let error: Error | null = null;
  const captureError = (value: unknown) => { error ??= value instanceof Error ? value : new Error(String(value)); };
  let videoEncoder: VideoEncoder | undefined;
  let audioEncoder: AudioEncoder | undefined;
  try {
    videoEncoder = new VideoEncoder({
      output: (chunk, metadata) => { try { muxer.addVideoChunk(chunk, metadata); } catch (e) { captureError(e); } }, error: captureError,
    });
    videoEncoder.configure(videoConfig);
    audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => { try { muxer.addAudioChunk(chunk, metadata); } catch (e) { captureError(e); } }, error: captureError,
    });
    audioEncoder.configure(audioConfig);
    preview.muteSpeakers(true);
    const left = audio.getChannelData(0), right = audio.getChannelData(1);
    for (let offset = 0; offset < audio.length; offset += 4096) {
      throwIfAborted(signal);
      if (error) throw error;
      const count = Math.min(4096, audio.length - offset);
      const planar = new Float32Array(count * 2);
      planar.set(left.subarray(offset, offset + count));
      planar.set(right.subarray(offset, offset + count), count);
      const data = new AudioData({ format: "f32-planar", sampleRate: audio.sampleRate, numberOfFrames: count, numberOfChannels: 2, timestamp: Math.round(offset / audio.sampleRate * 1e6), data: planar });
      try { audioEncoder.encode(data); } finally { data.close(); }
      if (audioEncoder.encodeQueueSize > 32) await waitForQueue(audioEncoder, 8, signal, () => error);
    }
    const frames = Math.max(1, Math.ceil(duration * FPS));
    const scratch = width !== rawWidth || height !== rawHeight ? document.createElement("canvas") : null;
    if (scratch) { scratch.width = width; scratch.height = height; }
    const scratchCtx = scratch?.getContext("2d");
    if (scratch && !scratchCtx) throw new Error("Could not create export canvas.");
    for (let i = 0; i < frames; i++) {
      throwIfAborted(signal);
      if (error) throw error;
      await drawExportFrame(preview, i / FPS * settings.audioSpeed, signal);
      if (canvas.width !== rawWidth || canvas.height !== rawHeight) throw new MediaExportError("Export settings changed. Retry with a fixed resolution.");
      if (scratchCtx) scratchCtx.drawImage(canvas, 0, 0, width, height);
      const timestamp = Math.round(i / FPS * 1e6);
      const end = Math.round(Math.min(duration, (i + 1) / FPS) * 1e6);
      const frame = new VideoFrame(scratch ?? canvas, { timestamp, duration: Math.max(1, end - timestamp) });
      try { videoEncoder.encode(frame, { keyFrame: i % 60 === 0 }); } finally { frame.close(); }
      if (videoEncoder.encodeQueueSize > 8) await waitForQueue(videoEncoder, 3, signal, () => error);
      if (i % 5 === 0 || i === frames - 1) onProgress({ phase: "rendering", progress: 0.1 + 0.85 * (i + 1) / frames, message: `Rendering frame ${i + 1} of ${frames}` });
      if (i % 15 === 0) await bounded(new Promise(resolve => setTimeout(resolve, 0)), "Rendering", signal);
    }
    onProgress({ phase: "finalizing", progress: 0.96, message: "Finalizing MP4…" });
    await bounded(Promise.all([videoEncoder.flush(), audioEncoder.flush()]), "Finalizing encoders", signal);
    if (error) throw error;
    throwIfAborted(signal);
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    if (!blob.size) throw new Error("The encoder produced an empty file.");
    onProgress({ phase: "done", progress: 1, message: "Done" });
    return { blob, ext: "mp4", mime: "video/mp4" };
  } finally {
    for (const encoder of [videoEncoder, audioEncoder]) {
      try { if (encoder && encoder.state !== "closed") encoder.close(); } catch { /* Already closed. */ }
    }
    preview.muteSpeakers(false);
  }
}
