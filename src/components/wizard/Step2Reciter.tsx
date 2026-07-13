import { useRef, useState } from "react";
import { RECITERS, AMBIENT_TRACKS } from "@/lib/reciters";
import { useProjectState } from "@/lib/project-state";
import { getAyahAudioSegments } from "@/lib/quran-api";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Play, Pause, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function Step2Reciter() {
  const { settings, update } = useProjectState();
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playPreview = async (reciterId: number) => {
    if (previewingId === reciterId) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    setLoadingId(reciterId);
    try {
      const segs = await getAyahAudioSegments(reciterId, settings.chapterId);
      const first = segs.find((s) => {
        const [, v] = s.verse_key.split(":").map(Number);
        return v === settings.fromAyah;
      }) ?? segs[0];
      if (!first) {
        toast.error("Couldn't load recitation, try another reciter");
        return;
      }
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = first.url;
      audioRef.current.onended = () => setPreviewingId(null);
      await audioRef.current.play();
      setPreviewingId(reciterId);
    } catch {
      toast.error("Couldn't load recitation, try another reciter");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-3 block">Choose a reciter</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RECITERS.map((r) => {
            const active = settings.reciterId === r.id;
            const playing = previewingId === r.id;
            const loading = loadingId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => update({ reciterId: r.id })}
                className={`group flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${
                  active
                    ? "border-accent bg-accent/10 shadow-gold"
                    : "border-border bg-card hover:border-accent/50"
                }`}
              >
                <div
                  className={`grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br ${r.accent} font-display text-lg font-bold text-white`}
                >
                  {r.initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div dir="rtl" className="truncate font-arabic text-xs text-muted-foreground">
                    {r.arabic}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-accent">
                    {r.style}
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1 text-xs hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    playPreview(r.id);
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : playing ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Preview
                </button>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-2 block">Audio speed</Label>
          <div className="flex gap-2">
            {[0.75, 1].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update({ audioSpeed: s as 0.75 | 1 })}
                className={`rounded-md border px-4 py-2 text-sm ${
                  settings.audioSpeed === s
                    ? "border-accent bg-accent/20"
                    : "border-border bg-card"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={settings.fadeIn} onCheckedChange={(v) => update({ fadeIn: v })} />
            Fade in
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={settings.fadeOut} onCheckedChange={(v) => update({ fadeOut: v })} />
            Fade out
          </label>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Ambient background sound</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update({ ambientId: null })}
            className={`rounded-md border px-3 py-2 text-sm ${
              !settings.ambientId ? "border-accent bg-accent/20" : "border-border bg-card"
            }`}
          >
            None
          </button>
          {AMBIENT_TRACKS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => update({ ambientId: a.id })}
              className={`rounded-md border px-3 py-2 text-sm ${
                settings.ambientId === a.id
                  ? "border-accent bg-accent/20"
                  : "border-border bg-card"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
        {settings.ambientId && (
          <div className="mt-3">
            <Label className="mb-2 block text-xs">
              Volume: {Math.round(settings.ambientVolume * 100)}%
            </Label>
            <Slider
              value={[settings.ambientVolume * 100]}
              min={0}
              max={40}
              step={1}
              onValueChange={(v) => update({ ambientVolume: v[0] / 100 })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
