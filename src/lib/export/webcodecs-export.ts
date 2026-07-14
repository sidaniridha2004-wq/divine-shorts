import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";
import type { ProjectSettings } from "@/types";

export type ExportProgress = {
  phase: "preparing" | "recording" | "encoding" | "done";
  progress: number; // 0..1
  message?: string;
};

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio: ${url}`);
  return await res.arrayBuffer();
}

async function mixAudio(
  reciterUrl: string,
  reciterOffset: number,
  duration: number,
  audioSpeed: number,
  ambientUrl?: string,
): Promise<AudioBuffer> {
  // We need to render `duration` seconds of audio.
  // Because duration is *audio time* (scaled by audioSpeed for real time),
  // the final buffer should be duration / audioSpeed seconds long!
  const realDuration = duration / audioSpeed;
  const sampleRate = 44100;
  
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * realDuration), sampleRate);

  const recBuf = await ctx.decodeAudioData(await fetchArrayBuffer(reciterUrl));
  const recNode = ctx.createBufferSource();
  recNode.buffer = recBuf;
  recNode.playbackRate.value = audioSpeed;
  recNode.connect(ctx.destination);
  
  // start(when, offset)
  // We start immediately (0) and offset into the MP3 by reciterOffset.
  recNode.start(0, reciterOffset);

  if (ambientUrl) {
    try {
      const ambBuf = await ctx.decodeAudioData(await fetchArrayBuffer(ambientUrl));
      const ambNode = ctx.createBufferSource();
      ambNode.buffer = ambBuf;
      ambNode.loop = true;
      const ambGain = ctx.createGain();
      // Apply the same 0.15 gain used in PreviewCanvas
      ambGain.gain.value = 0.15;
      ambNode.connect(ambGain).connect(ctx.destination);
      ambNode.start(0);
    } catch (e) {
      console.warn("Ambient audio failed to load during export", e);
    }
  }

  return await ctx.startRendering();
}

export async function exportVideo(
  preview: PreviewHandle,
  onProgress: (p: ExportProgress) => void,
  settings: ProjectSettings,
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const canvas = preview.getCanvas();
  const segments = preview.getSegmentTimings();
  if (!canvas || !segments.length) throw new Error("Preview not ready");

  onProgress({ phase: "preparing", progress: 0.05, message: "Processing Audio..." });

  const [reciterEl, ambientEl] = preview.getAudioElements?.() || [];
  if (!reciterEl?.src) throw new Error("Reciter audio source not found");

  const audioSpeed = settings.audioSpeed ?? 1;
  const duration = preview.getDuration() * audioSpeed; // getDuration returns real duration, we want logical duration

  const mixedAudio = await mixAudio(
    reciterEl.src,
    segments[0].absoluteStart,
    duration,
    audioSpeed,
    ambientEl?.src
  );

  onProgress({ phase: "encoding", progress: 0.15, message: "Encoding Video..." });

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
      sampleRate: mixedAudio.sampleRate,
      numberOfChannels: mixedAudio.numberOfChannels,
    },
    firstTimestampBehavior: "offset",
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error("AudioEncoder error:", e),
  });
  
  audioEncoder.configure({
    codec: "mp4a.40.2",
    sampleRate: mixedAudio.sampleRate,
    numberOfChannels: mixedAudio.numberOfChannels,
    bitrate: 128_000,
  });

  // Feed audio chunks
  const sampleRate = mixedAudio.sampleRate;
  const numChannels = mixedAudio.numberOfChannels;
  const length = mixedAudio.length;
  const chunkSize = sampleRate; // 1 second chunks

  for (let start = 0; start < length; start += chunkSize) {
    const end = Math.min(start + chunkSize, length);
    const size = end - start;
    const data = new Float32Array(size * numChannels);
    
    for (let c = 0; c < numChannels; c++) {
      const channelData = mixedAudio.getChannelData(c);
      data.set(channelData.subarray(start, end), c * size);
    }

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: size,
      numberOfChannels: numChannels,
      timestamp: (start / sampleRate) * 1e6,
      data,
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }
  await audioEncoder.flush();

  // Video Encoding
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

  const offscreen = new OffscreenCanvas(vWidth, vHeight);
  const offCtx = offscreen.getContext("2d")!;
  const fps = 30;
  // Use realDuration for the number of frames
  const realDuration = duration / audioSpeed;
  const totalFrames = Math.ceil(realDuration * fps);

  for (let i = 0; i < totalFrames; i++) {
    // t is logical audio time!
    // Since real frame time is i / fps, audio time is (i / fps) * audioSpeed
    const t = (i / fps) * audioSpeed;
    await preview.drawFrame(t);
    
    offCtx.drawImage(canvas, 0, 0, vWidth, vHeight);
    
    const frame = new VideoFrame(offscreen, {
      timestamp: (i / fps) * 1e6,
    });
    
    videoEncoder.encode(frame);
    frame.close();

    if (i % 10 === 0) {
      const p = 0.15 + (i / totalFrames) * 0.8;
      onProgress({ phase: "encoding", progress: p, message: "Encoding Video..." });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  onProgress({ phase: "done", progress: 1, message: "Complete" });
  
  return { blob, ext: "mp4", mime: "video/mp4" };
}
