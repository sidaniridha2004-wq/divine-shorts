import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";
import type { ProjectSettings } from "@/lib/project-state";

// ─────────────────────────────────────────────────────────────────────────────
// Fast MP4 export.
//
// The previous implementation had two sequential passes and captured audio in
// REAL TIME through a deprecated ScriptProcessorNode, so a 30 second reel cost
// at least 30 seconds before a single video frame was encoded. It also slept
// with setTimeout(0) on every frame (clamped to ~4ms by browsers, so ~3.6s of
// pure artificial delay over 900 frames), performed two full-resolution blits
// per frame, and used a flat 5 Mbps bitrate regardless of resolution.
//
// This version:
//   1. Renders audio with OfflineAudioContext, which runs as fast as the CPU
//      allows (typically 20-100x realtime) instead of at playback speed.
//   2. Uses real encoder backpressure (encodeQueueSize + the dequeue event)
//      instead of arbitrary sleeps.
//   3. Encodes frames straight from the preview canvas, dropping a blit.
//   4. Probes codec support hardware-first and scales bitrate with pixel rate.
//   5. Emits a keyframe every 2s so the file seeks properly in editors.
//   6. Propagates encoder errors, supports cancellation, and always restores
//      the preview's audio state.
// ─────────────────────────────────────────────────────────────────────────────

export type ExportPhase =
  | "preparing"
  | "audio"
  | "rendering"
  | "finalizing"
  | "done";

export type ExportProgress = {
  phase: ExportPhase;
  progress: number;
  message?: string;
};

export type ExportResult = { blob: Blob; ext: string; mime: string };

const FPS = 30;
const KEYFRAME_INTERVAL_S = 2;
const AUDIO_CHUNK_FRAMES = 4096;
const VIDEO_QUEUE_HIGH = 8;
const VIDEO_QUEUE_LOW = 3;
const AUDIO_QUEUE_HIGH = 32;
const AUDIO_QUEUE_LOW = 8;
const MASTER_FADE_S = 1.0;
const RECITER_TAIL_FADE_S = 0.8;
const BITS_PER_PIXEL = 0.12;
const MIN_BITRATE = 2_500_000;
const MAX_BITRATE = 24_000_000;
const MAX_SAMPLE_RATE = 48_000;

// High -> baseline. High profile gives noticeably cleaner edges on Arabic
// glyphs at the same bitrate, so it is tried first.
const H264_CODECS = ["avc1.640028", "avc1.4D0028", "avc1.42E028"];

export function isWebCodecsExportSupported(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof AudioData !== "undefined" &&
    typeof OfflineAudioContext !== "undefined"
  );
}

function bitrateFor(width: number, height: number, fps: number): number {
  const raw = width * height * fps * BITS_PER_PIXEL;
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw)));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Export cancelled", "AbortError");
  }
}

/**
 * Wait until the encoder has drained below `low`. Uses the dequeue event with
 * a polling safety net, which is what replaces the old per-frame sleeps.
 */
function waitForQueue(
  encoder: VideoEncoder | AudioEncoder,
  low: number,
): Promise<void> {
  if (encoder.encodeQueueSize <= low) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      encoder.removeEventListener("dequeue", check);
      clearInterval(poll);
      resolve();
    };
    const check = () => {
      if (encoder.encodeQueueSize <= low) finish();
    };
    const poll = setInterval(check, 8);
    encoder.addEventListener("dequeue", check);
    check();
  });
}

async function pickVideoConfig(
  width: number,
  height: number,
  bitrate: number,
): Promise<VideoEncoderConfig | null> {
  const accelerations: HardwareAcceleration[] = [
    "prefer-hardware",
    "no-preference",
  ];
  for (const codec of H264_CODECS) {
    for (const hardwareAcceleration of accelerations) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: FPS,
        hardwareAcceleration,
        latencyMode: "quality",
        avc: { format: "avc" },
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return support.config ?? config;
      } catch {
        // Try the next rung of the ladder.
      }
    }
  }
  return null;
}

async function decodeUrl(
  ctx: BaseAudioContext,
  url: string | null | undefined,
): Promise<AudioBuffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

type AudioRenderOptions = {
  reciterUrl: string | null;
  ambientUrl: string | null;
  ambientVolume: number;
  /** Offset into the reciter file where the selected verses begin. */
  startOffset: number;
  /** Playback rate; also stretches the output duration. */
  rate: number;
  /** Wall-clock length of the exported video, in seconds. */
  outDuration: number;
  /** Wall-clock time at which the recitation itself ends. */
  verseEndWall: number;
  sampleRate: number;
  decodeCtx: BaseAudioContext;
};

/**
 * Render the full mix offline. This is the single biggest speedup: it replaces
 * a realtime capture that was bounded by the length of the recitation.
 */
async function renderAudioOffline(
  opts: AudioRenderOptions,
): Promise<AudioBuffer | null> {
  const reciterBuffer = await decodeUrl(opts.decodeCtx, opts.reciterUrl);
  if (!reciterBuffer) return null;
  const ambientBuffer =
    opts.ambientVolume > 0
      ? await decodeUrl(opts.decodeCtx, opts.ambientUrl)
      : null;

  const length = Math.max(1, Math.ceil(opts.outDuration * opts.sampleRate));
  const octx = new OfflineAudioContext({
    numberOfChannels: 2,
    length,
    sampleRate: opts.sampleRate,
  });

  // Master bus with the closing fade.
  const master = octx.createGain();
  master.gain.setValueAtTime(1, 0);
  const masterFadeStart = Math.max(0, opts.outDuration - MASTER_FADE_S);
  master.gain.setValueAtTime(1, masterFadeStart);
  master.gain.linearRampToValueAtTime(0, opts.outDuration);
  master.connect(octx.destination);

  // Recitation, trimmed to the selected verses and faded out at the tail.
  const reciter = octx.createBufferSource();
  reciter.buffer = reciterBuffer;
  reciter.playbackRate.value = opts.rate;
  const reciterGain = octx.createGain();
  const tailStart = Math.min(Math.max(0, opts.verseEndWall), opts.outDuration);
  const tailEnd = Math.min(
    opts.outDuration,
    tailStart + RECITER_TAIL_FADE_S / opts.rate,
  );
  reciterGain.gain.setValueAtTime(1, 0);
  reciterGain.gain.setValueAtTime(1, tailStart);
  reciterGain.gain.linearRampToValueAtTime(0, tailEnd);
  reciter.connect(reciterGain);
  reciterGain.connect(master);
  reciter.start(0, Math.max(0, opts.startOffset));

  if (ambientBuffer) {
    const ambient = octx.createBufferSource();
    ambient.buffer = ambientBuffer;
    ambient.loop = true;
    const ambientGain = octx.createGain();
    ambientGain.gain.value = opts.ambientVolume;
    ambient.connect(ambientGain);
    ambientGain.connect(master);
    ambient.start(0);
  }

  return await octx.startRendering();
}

type LegacyExporter = (
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
) => Promise<ExportResult>;

async function runFallback(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
): Promise<ExportResult> {
  const mod = (await import("./mediarecorder-export")) as unknown as Record<
    string,
    LegacyExporter | undefined
  >;
  const legacy = mod.exportVideo;
  if (typeof legacy !== "function") {
    throw new Error("Video export is not supported in this browser.");
  }
  return legacy(preview, onProgress);
}

export async function exportVideo(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
  settings: ProjectSettings,
  signal?: AbortSignal,
): Promise<ExportResult> {
  if (!isWebCodecsExportSupported()) {
    onProgress({
      phase: "preparing",
      progress: 0,
      message: "Using compatibility mode…",
    });
    return runFallback(preview, onProgress);
  }

  try {
    return await encodeWithWebCodecs(preview, onProgress, settings, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn(
      "[export] WebCodecs path failed, falling back to MediaRecorder",
      err,
    );
    onProgress({
      phase: "preparing",
      progress: 0,
      message: "Switching to compatibility mode…",
    });
    return runFallback(preview, onProgress);
  }
}

async function encodeWithWebCodecs(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
  settings: ProjectSettings,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const canvas = preview.getCanvas();
  if (!canvas) throw new Error("Preview canvas is not ready.");

  const rate = settings.audioSpeed || 1;
  // getDuration() is already wall-clock (timeline length / audioSpeed).
  const outDuration = preview.getDuration();
  if (!Number.isFinite(outDuration) || outDuration <= 0) {
    throw new Error("Nothing to export yet.");
  }

  const segments = preview.getSegmentTimings();
  const lastSegment = segments[segments.length - 1];
  const timelineVerseEnd = lastSegment
    ? lastSegment.start + lastSegment.duration
    : outDuration * rate;
  const verseEndWall = timelineVerseEnd / rate;
  const startOffset = segments[0]?.absoluteStart ?? 0;

  // Even dimensions are required by H.264. All of the app's presets already
  // are, but guard anyway rather than failing at encoder init.
  const rawWidth = canvas.width;
  const rawHeight = canvas.height;
  const width = rawWidth - (rawWidth % 2);
  const height = rawHeight - (rawHeight % 2);
  if (width < 2 || height < 2) throw new Error("Preview canvas has no size.");

  let scratch: OffscreenCanvas | null = null;
  let scratchCtx: OffscreenCanvasRenderingContext2D | null = null;
  if (width !== rawWidth || height !== rawHeight) {
    scratch = new OffscreenCanvas(width, height);
    scratchCtx = scratch.getContext("2d");
  }

  onProgress({
    phase: "preparing",
    progress: 0,
    message: "Checking encoder support…",
  });

  const bitrate = bitrateFor(width, height, FPS);
  const videoConfig = await pickVideoConfig(width, height, bitrate);
  if (!videoConfig) {
    throw new Error("No supported H.264 encoder configuration.");
  }

  // ── Audio, rendered offline ───────────────────────────────────────────────
  onProgress({ phase: "audio", progress: 0.02, message: "Mixing audio…" });

  const liveCtx = preview.getAudioContext();
  const audioElements = preview.getAudioElements();
  const reciterEl = audioElements[0] ?? null;
  const ambientEl = audioElements[1] ?? null;
  const reciterUrl = reciterEl?.currentSrc || reciterEl?.src || null;
  const ambientUrl = ambientEl?.currentSrc || ambientEl?.src || null;

  const nativeRate = liveCtx?.sampleRate ?? 48_000;
  const sampleRate = Math.min(MAX_SAMPLE_RATE, Math.max(8_000, nativeRate));
  const decodeCtx: BaseAudioContext =
    liveCtx ??
    new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate });

  let mixedAudio: AudioBuffer | null = null;
  try {
    mixedAudio = await renderAudioOffline({
      reciterUrl,
      ambientUrl,
      ambientVolume: settings.ambientVolume ?? 0,
      startOffset,
      rate,
      outDuration,
      verseEndWall,
      sampleRate,
      decodeCtx,
    });
  } catch (err) {
    console.warn("[export] offline audio render failed, exporting silent", err);
  }
  throwIfAborted(signal);

  // ── Muxer + encoders ──────────────────────────────────────────────────────
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
    video: { codec: "avc", width, height },
    ...(mixedAudio
      ? {
          audio: {
            codec: "aac" as const,
            numberOfChannels: 2,
            sampleRate: mixedAudio.sampleRate,
          },
        }
      : {}),
  });

  let encoderError: Error | null = null;
  const captureError = (e: unknown) => {
    if (!encoderError) {
      encoderError = e instanceof Error ? e : new Error(String(e));
    }
  };

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: captureError,
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (mixedAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: captureError,
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: mixedAudio.sampleRate,
      numberOfChannels: 2,
      bitrate: 192_000,
    });
  }

  preview.muteSpeakers(true);

  try {
    // ── Encode audio ───────────────────────────────────────────────────────
    if (mixedAudio && audioEncoder) {
      const total = mixedAudio.length;
      const left = mixedAudio.getChannelData(0);
      const right =
        mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : left;

      for (let offset = 0; offset < total; offset += AUDIO_CHUNK_FRAMES) {
        throwIfAborted(signal);
        if (encoderError) throw encoderError;

        const frames = Math.min(AUDIO_CHUNK_FRAMES, total - offset);
        const planar = new Float32Array(frames * 2);
        planar.set(left.subarray(offset, offset + frames), 0);
        planar.set(right.subarray(offset, offset + frames), frames);

        const audioData = new AudioData({
          format: "f32-planar",
          sampleRate: mixedAudio.sampleRate,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: Math.round((offset / mixedAudio.sampleRate) * 1e6),
          data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();

        if (audioEncoder.encodeQueueSize > AUDIO_QUEUE_HIGH) {
          await waitForQueue(audioEncoder, AUDIO_QUEUE_LOW);
        }

        if (offset % (AUDIO_CHUNK_FRAMES * 32) === 0) {
          onProgress({
            phase: "audio",
            progress: 0.02 + 0.08 * (offset / total),
            message: "Encoding audio…",
          });
        }
      }
    }

    // ── Encode video ───────────────────────────────────────────────────────
    const totalFrames = Math.max(1, Math.round(outDuration * FPS));
    const keyframeEvery = FPS * KEYFRAME_INTERVAL_S;
    const frameDuration = Math.round(1e6 / FPS);

    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted(signal);
      if (encoderError) throw encoderError;

      // Timeline position for this output frame.
      await preview.drawFrame((i / FPS) * rate, true);

      let source: CanvasImageSource = canvas;
      if (scratch && scratchCtx) {
        scratchCtx.drawImage(canvas, 0, 0, width, height);
        source = scratch;
      }

      const frame = new VideoFrame(source, {
        timestamp: Math.round((i / FPS) * 1e6),
        duration: frameDuration,
      });
      videoEncoder.encode(frame, { keyFrame: i % keyframeEvery === 0 });
      frame.close();

      if (videoEncoder.encodeQueueSize > VIDEO_QUEUE_HIGH) {
        await waitForQueue(videoEncoder, VIDEO_QUEUE_LOW);
      }

      if (i % 5 === 0 || i === totalFrames - 1) {
        onProgress({
          phase: "rendering",
          progress: 0.1 + 0.85 * ((i + 1) / totalFrames),
          message: "Rendering frame " + (i + 1) + " of " + totalFrames,
        });
      }
    }

    onProgress({
      phase: "finalizing",
      progress: 0.96,
      message: "Finalizing MP4…",
    });

    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (encoderError) throw encoderError;

    muxer.finalize();

    const blob = new Blob([target.buffer], { type: "video/mp4" });
    onProgress({ phase: "done", progress: 1, message: "Done" });
    return { blob, ext: "mp4", mime: "video/mp4" };
  } finally {
    // Always restore audio and release encoder resources, even on abort.
    preview.muteSpeakers(false);
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {
      /* already closed */
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    } catch {
      /* already closed */
    }
  }
}
