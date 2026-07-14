import { useEffect, useMemo, useRef, useState } from "react";
import { AMBIENT_TRACKS } from "@/lib/reciters";
import { useProjectState } from "@/lib/project-state";
import { getMp3QuranReciters, type Mp3QuranReciter } from "@/lib/quran-api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, Pause, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

const FAV_KEY = "quranreels:fav-reciters";

function loadFavs(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function Step2Reciter() {
  const { settings, update } = useProjectState();
  const [reciters, setReciters] = useState<Mp3QuranReciter[] | null>(null);
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<number[]>(loadFavs);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    getMp3QuranReciters().then(setReciters);
  }, []);


  // Stop preview audio when leaving this step
  useEffect(() => () => audioRef.current?.pause(), []);

  const toggleFav = (id: number) => {
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const shown = useMemo(() => {
    const base = reciters ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.rewaya.toLowerCase().includes(q),
        )
      : base;
    // Favorites pinned to the top (stable order otherwise)
    return [...filtered].sort(
      (a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)),
    );
  }, [reciters, query, favs]);

  const playPreview = async (reciterId: number) => {
    if (previewingId === reciterId) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    setLoadingId(reciterId);
    try {
      const reciter = reciters?.find(r => r.id === reciterId);
      if (!reciter) throw new Error();
      
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.crossOrigin = "anonymous";
      }
      // Preview with Surah Al-Fatihah (001)
      audioRef.current.src = `${reciter.folder_url}001.mp3`;
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <Label>Choose a reciter</Label>
          <span className="text-xs text-muted-foreground">
            {reciters ? `${shown.length} reciters` : "Loading…"}
          </span>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reciters…"
          className="mb-3"
        />
        {!reciters ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {shown.map((r) => {
              const active = settings.reciterId === r.id;
              const playing = previewingId === r.id;
              const loading = loadingId === r.id;
              const fav = favs.includes(r.id);
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => update({ reciterId: r.id })}
                  onKeyDown={(e) => e.key === "Enter" && update({ reciterId: r.id })}
                  className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${
                    active
                      ? "border-accent bg-accent/10 shadow-gold"
                      : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(r.id);
                    }}
                  >
                    <Star
                      className={`h-4 w-4 ${fav ? "fill-accent text-accent" : ""}`}
                    />
                  </button>
                  <div
                    className={`grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 font-display text-lg font-bold text-white`}
                  >
                    {r.name.split(" ").slice(0,2).map(n => n[0]).join("")}
                  </div>
                  <div className="min-w-0">
                    <div dir="rtl" className="truncate font-arabic text-sm font-medium text-foreground">
                      {r.name}
                    </div>
                    <div className="text-[10px] tracking-widest text-accent">
                      {r.rewaya}
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
                </div>
              );
            })}
            {shown.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                No reciters match "{query}"
              </p>
            )}
          </div>
        )}
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
