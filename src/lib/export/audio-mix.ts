import type { PreviewHandle } from "@/components/wizard/PreviewCanvas";
import type { ProjectSettings } from "@/lib/project-state";
import { bounded, throwIfAborted, MediaExportError } from "./runtime";

async function decodeAudio(ctx: BaseAudioContext, url: string, signal: AbortSignal): Promise<AudioBuffer> {
  if (!url) throw new MediaExportError("Recitation is not loaded. Wait for the preview, then retry.");
  throwIfAborted(signal);
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit", signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    return await bounded(ctx.decodeAudioData(bytes), "Decoding audio", signal);
  } catch (error) {
    throwIfAborted(signal);
    throw new MediaExportError(`Could not load audio. Try another reciter or ambient track. (${error instanceof Error ? error.message : "network error"})`);
  }
}

export async function renderExportAudio(preview: PreviewHandle, settings: ProjectSettings, duration: number, signal?: AbortSignal): Promise<AudioBuffer> {
  const segments = preview.getSegmentTimings();
  const first = segments[0], last = segments[segments.length - 1];
  const rate = settings.audioSpeed;
  if (!first || !last || !(rate > 0)) throw new MediaExportError("No valid recitation timings are available.");
  const selectedSeconds = last.absoluteEnd - first.absoluteStart;
  if (!Number.isFinite(selectedSeconds) || selectedSeconds <= 0 || first.absoluteStart < 0) throw new MediaExportError("The selected recitation timings are invalid.");
  const sampleRate = 48_000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const [reciterEl, ambientEl] = preview.getAudioElements();
  const loadController = new AbortController();
  const abortLoad = () => loadController.abort();
  signal?.addEventListener("abort", abortLoad, { once: true });
  const timer = setTimeout(abortLoad, 60_000);
  let recitation: AudioBuffer;
  let ambient: AudioBuffer | null = null;
  try {
    throwIfAborted(signal);
    [recitation, ambient] = await Promise.all([
      decodeAudio(ctx, reciterEl?.currentSrc || reciterEl?.src || "", loadController.signal),
      settings.ambientId && settings.ambientVolume > 0
        ? decodeAudio(ctx, ambientEl?.currentSrc || ambientEl?.src || "", loadController.signal)
        : Promise.resolve(null),
    ]);
  } catch (error) {
    throwIfAborted(signal);
    if (loadController.signal.aborted) throw new MediaExportError("Audio loading timed out. Check your connection and retry.");
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abortLoad); loadController.abort();
  }
  if (recitation.duration + 0.1 < last.absoluteEnd) throw new MediaExportError("Recitation audio is shorter than its verse timings. Try another reciter.");
  const end = Math.min(duration, selectedSeconds / rate);
  const source = ctx.createBufferSource();
  source.buffer = recitation; source.playbackRate.value = rate;
  const gain = ctx.createGain();
  const fade = Math.min(0.8, end / 2);
  gain.gain.setValueAtTime(settings.fadeIn ? 0 : 1, 0);
  if (settings.fadeIn) gain.gain.linearRampToValueAtTime(1, fade);
  if (settings.fadeOut) {
    gain.gain.setValueAtTime(1, Math.max(fade, end - fade));
    gain.gain.linearRampToValueAtTime(0, end);
  }
  source.connect(gain).connect(ctx.destination);
  // Stop precisely at the selected verse boundary, not during the next ayah.
  source.start(0, first.absoluteStart, selectedSeconds);
  if (ambient) {
    const bed = ctx.createBufferSource(); bed.buffer = ambient; bed.loop = true;
    const bedGain = ctx.createGain();
    const volume = Math.max(0, Math.min(1, settings.ambientVolume));
    bedGain.gain.setValueAtTime(volume, 0);
    bedGain.gain.setValueAtTime(volume, Math.max(0, duration - 1));
    bedGain.gain.linearRampToValueAtTime(0, duration);
    bed.connect(bedGain).connect(ctx.destination); bed.start(0);
  }
  return bounded(ctx.startRendering(), "Mixing audio", signal, 60_000);
}
