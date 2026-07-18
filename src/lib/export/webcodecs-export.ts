import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";
import type { ProjectSettings } from "@/lib/project-state";

export type ExportProgress = {
  phase: "preparing" | "recording" | "encoding" | "done";
  progress: number; // 0..1
  message?: string;
};

export async function exportVideo(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
  settings: ProjectSettings,
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const canvas = preview.getCanvas();
  const segments = preview.getSegmentTimings();
  if (!canvas || !segments.length) throw new Error("Preview not ready");

  const [reciterEl, ambientEl] = preview.getAudioElements?.() || [];
  if (!reciterEl?.src) throw new Error("Reciter audio source not found");

  const destNode = preview.getMasterGain?.() || preview.getAudioDestination();
  if (!destNode) throw new Error("Audio destination not available");
  const audioCtx = destNode.context as AudioContext;
  const sampleRate = audioCtx.sampleRate;
  const numChannels = 2; // WebAudio stereo

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  // Mute speakers so the user doesn't hear the high-speed/real-time export audio
  preview.muteSpeakers?.(true);

  onProgress({ phase: "preparing", progress: 0.05, message: "Setting up encoders..." });

  const audioSpeed = settings.audioSpeed ?? 1;
  const duration = preview.getDuration() * audioSpeed; 
  const realDuration = duration / audioSpeed;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: canvas.width - (canvas.width % 2),
      height: canvas.height - (canvas.height % 2),
    },
    audio: {
      codec: "aac",
      sampleRate,
      numberOfChannels: numChannels,
    },
    firstTimestampBehavior: "offset",
    fastStart: "in-memory",
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error("AudioEncoder error:", e),
  });
  
  audioEncoder.configure({
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: numChannels,
    bitrate: 128_000,
  });

  const vWidth = canvas.width - (canvas.width % 2);
  const vHeight = canvas.height - (canvas.height % 2);
  
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("VideoEncoder error:", e),
  });
  videoEncoder.configure({
    codec: "avc1.640028",
    width: vWidth,
    height: vHeight,
    bitrate: 5_000_000,
    framerate: 30,
  });

  // Setup ScriptProcessor for Audio
  const processor = audioCtx.createScriptProcessor(16384, numChannels, numChannels);
  let audioTime = 0;
  let finishedAudio = false;
  
  let audioResolve: () => void;
  const audioPromise = new Promise<void>((r) => (audioResolve = r));

  processor.onaudioprocess = (e) => {
    if (finishedAudio) return;
    
    const left = e.inputBuffer.getChannelData(0);
    const right = e.inputBuffer.getChannelData(1);
    const size = left.length;
    
    // WebCodecs 'f32-planar' expects all left samples, then all right samples
    const data = new Float32Array(size * 2);

    const fadeDuration = 1.0;
    for (let i = 0; i < size; i++) {
        const currentSampleTime = audioTime + (i / sampleRate);
        const timeRemaining = realDuration - currentSampleTime;
        let fade = 1;
        if (timeRemaining < fadeDuration) {
            fade = Math.max(0, timeRemaining / fadeDuration);
        }
        data[i] = left[i] * fade;
        data[size + i] = right[i] * fade;
    }

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: size,
      numberOfChannels: numChannels,
      timestamp: Math.round(audioTime * 1e6),
      data,
    });
    
    audioEncoder.encode(audioData);
    audioData.close();
    
    audioTime += size / sampleRate;
    
    if (audioTime >= realDuration) {
      finishedAudio = true;
      audioResolve();
    }
  };

  destNode.connect(processor);
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0;
  processor.connect(silentGain);
  silentGain.connect(audioCtx.destination);

  onProgress({ phase: "encoding", progress: 0.06, message: "Buffering audio to exact timestamp (may take a moment)..." });
  
  const waitAudioReady = (el: HTMLAudioElement) => new Promise<void>((resolve) => {
    if (el.readyState >= 3) {
      resolve();
      return;
    }
    const onPlaying = () => {
      el.removeEventListener("playing", onPlaying);
      resolve();
    };
    el.addEventListener("playing", onPlaying);
    // 30s fallback timeout for very slow networks
    setTimeout(() => {
      el.removeEventListener("playing", onPlaying);
      resolve();
    }, 30000);
  });

  // Play audio elements
  const reciterGain = preview.getReciterGain?.();
  if (reciterGain) {
    const lastSeg = segments[segments.length - 1];
    const reciterPhysicalDuration = (lastSeg.start + lastSeg.duration) / audioSpeed;
    const now = audioCtx.currentTime;
    reciterGain.gain.cancelScheduledValues(now);
    reciterGain.gain.setValueAtTime(1, now);
    
    // Fade out over 0.8s starting *after* the verse ends, into the padding.
    // This prevents cutting off echoes or breaths at the end of the word.
    reciterGain.gain.setValueAtTime(1, now + reciterPhysicalDuration);
    reciterGain.gain.linearRampToValueAtTime(0, now + reciterPhysicalDuration + (0.8 / audioSpeed));
  }

  reciterEl.currentTime = segments[0].absoluteStart;
  reciterEl.playbackRate = audioSpeed;
  const p1 = waitAudioReady(reciterEl);
  reciterEl.play().catch(console.warn);
  
  let p2 = Promise.resolve();
  if (ambientEl) {
    ambientEl.currentTime = 0;
    p2 = waitAudioReady(ambientEl);
    ambientEl.play().catch(console.warn);
  }

  await Promise.all([p1, p2]);

  onProgress({ phase: "encoding", progress: 0.1, message: "Recording audio (guaranteeing clarity)..." });
  await audioPromise;
  
  // Cleanup audio
  reciterEl.pause();
  if (ambientEl) ambientEl.pause();
  silentGain.disconnect();
  destNode.disconnect(processor);

  // Video Encoding Loop
  const offscreen = new OffscreenCanvas(vWidth, vHeight);
  const offCtx = offscreen.getContext("2d")!;
  const fps = 30;
  const totalFrames = Math.ceil(realDuration * fps);

  for (let i = 0; i < totalFrames; i++) {
    const t = (i / fps) * audioSpeed;
    await preview.drawFrame(t, true);
    
    offCtx.drawImage(canvas, 0, 0, vWidth, vHeight);
    
    const frame = new VideoFrame(offscreen, {
      timestamp: Math.round((i / fps) * 1e6),
    });
    
    videoEncoder.encode(frame);
    frame.close();

    // Yield to allow main thread to process (since audio is done, we can just yield briefly)
    if (i % 15 === 0) {
      const p = 0.3 + (i / totalFrames) * 0.6;
      onProgress({ phase: "encoding", progress: p, message: "Encoding Video..." });
      await new Promise((r) => setTimeout(r, 5));
    } else {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

    onProgress({ phase: "encoding", progress: 0.95, message: "Finalizing MP4..." });

    await videoEncoder.flush();
    await audioEncoder.flush();
    muxer.finalize();

  preview.muteSpeakers?.(false);
  processor.disconnect();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  onProgress({ phase: "done", progress: 1, message: "Complete" });
  
  return { blob, ext: "mp4", mime: "video/mp4" };
}
