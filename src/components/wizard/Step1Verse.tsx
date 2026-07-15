import { useEffect, useState } from "react";
import { getChapters, searchVerses, getVersesByChapter, type Chapter } from "@/lib/quran-api";
import { useProjectState } from "@/lib/project-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function Step1Verse() {
  const { settings, update } = useProjectState();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<{ verse_key: string; text: string; translation: string }[]>([]);
  const [preview, setPreview] = useState<{ arabic: string; translation: string }>({ arabic: "", translation: "" });
  const [maxAyah, setMaxAyah] = useState(286);
  
  // Local state for inputs to allow empty values during typing
  const [localFrom, setLocalFrom] = useState(settings.fromAyah.toString());
  const [localTo, setLocalTo] = useState(settings.toAyah.toString());

  useEffect(() => {
    setLocalFrom(settings.fromAyah.toString());
    setLocalTo(settings.toAyah.toString());
  }, [settings.fromAyah, settings.toAyah]);

  useEffect(() => {
    getChapters().then(setChapters).catch(() => toast.error("Couldn't load surah list"));
  }, []);

  useEffect(() => {
    const ch = chapters.find((c) => c.id === settings.chapterId);
    if (ch) {
      setMaxAyah(ch.verses_count);
      update({ chapterName: ch.name_simple });
    }
  }, [settings.chapterId, chapters]);

  useEffect(() => {
    getVersesByChapter(settings.chapterId, {
      translationIds: settings.translationId ? [settings.translationId] : [],
    })
      .then((verses) => {
        const first = verses.find((v) => v.verse_number === settings.fromAyah);
        setPreview({
          arabic: first?.text_uthmani ?? "",
          translation: first?.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "",
        });
      })
      .catch(() => {});
  }, [settings.chapterId, settings.fromAyah, settings.translationId]);

  useEffect(() => {
    if (!q.trim()) {
      setSearch([]);
      return;
    }
    const t = setTimeout(() => searchVerses(q).then(setSearch), 400);
    return () => clearTimeout(t);
  }, [q]);

  const ayahsCount = settings.toAyah - settings.fromAyah + 1;
  const overLimit = ayahsCount > 50;

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Search verses by keyword</Label>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. patience, mercy, light…"
        />
        {search.length > 0 && (
          <div className="mt-2 max-h-52 overflow-auto rounded-md border border-border bg-card">
            {search.map((r) => (
              <button
                key={r.verse_key}
                type="button"
                className="block w-full border-b border-border/50 p-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  const [c, v] = r.verse_key.split(":").map(Number);
                  update({ chapterId: c, fromAyah: v, toAyah: v });
                  setQ("");
                  setSearch([]);
                }}
              >
                <div className="font-medium">{r.verse_key}</div>
                <div className="text-muted-foreground line-clamp-2">
                  {r.translation.replace(/<[^>]*>/g, "")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Surah</Label>
        {chapters.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <select
            className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm"
            value={settings.chapterId}
            onChange={(e) => {
              const id = Number(e.target.value);
              const ch = chapters.find((c) => c.id === id);
              update({
                chapterId: id,
                chapterName: ch?.name_simple ?? "",
                fromAyah: 1,
                toAyah: Math.min(3, ch?.verses_count ?? 1),
              });
            }}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}. {c.name_simple} — {c.name_arabic} ({c.verses_count} ayat)
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-2 block">From ayah</Label>
          <Input
            type="number"
            min={1}
            max={maxAyah}
            value={localFrom}
            onChange={(e) => setLocalFrom(e.target.value)}
            onBlur={() => {
              const val = parseInt(localFrom, 10);
              const clamped = isNaN(val) ? 1 : Math.max(1, Math.min(maxAyah, val));
              setLocalFrom(clamped.toString());
              update({ fromAyah: clamped });
            }}
          />
        </div>
        <div>
          <Label className="mb-2 block">To ayah</Label>
          <Input
            type="number"
            min={settings.fromAyah}
            max={maxAyah}
            value={localTo}
            onChange={(e) => setLocalTo(e.target.value)}
            onBlur={() => {
              const val = parseInt(localTo, 10);
              const clamped = isNaN(val) ? settings.fromAyah : Math.max(settings.fromAyah, Math.min(maxAyah, val));
              setLocalTo(clamped.toString());
              update({ toAyah: clamped });
            }}
          />
        </div>
      </div>

      {overLimit && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          Exporting more than 50 ayahs might take a long time to render in your browser.
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
          Preview — {settings.chapterId}:{settings.fromAyah}
        </div>
        <div dir="rtl" className="font-arabic text-3xl leading-loose">
          {preview.arabic || "…"}
        </div>
        {preview.translation && (
          <div className="mt-3 text-sm text-muted-foreground">{preview.translation}</div>
        )}
      </div>
    </div>
  );
}
