import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getChapters, getVersesByChapter, type Verse } from "@/lib/quran-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/daily")({
  head: () => ({
    meta: [
      { title: "Verse of the Day — QuranReels Pro" },
      { name: "description", content: "Today's verse — turn it into a video with one click." },
    ],
  }),
  component: DailyPage,
});

// Deterministic verse by date: pick from curated inspirational list
const DAILY_POOL: { chapterId: number; ayah: number }[] = [
  { chapterId: 2, ayah: 255 },
  { chapterId: 2, ayah: 286 },
  { chapterId: 94, ayah: 6 },
  { chapterId: 65, ayah: 3 },
  { chapterId: 39, ayah: 53 },
  { chapterId: 3, ayah: 139 },
  { chapterId: 13, ayah: 28 },
  { chapterId: 55, ayah: 13 },
  { chapterId: 93, ayah: 5 },
  { chapterId: 8, ayah: 46 },
  { chapterId: 24, ayah: 35 },
  { chapterId: 20, ayah: 25 },
  { chapterId: 40, ayah: 60 },
  { chapterId: 42, ayah: 43 },
];

function DailyPage() {
  const [verse, setVerse] = useState<{ arabic: string; translation: string; ref: string; chapterName: string } | null>(null);
  const today = new Date();
  const dayIdx = Math.floor(today.getTime() / 86400000) % DAILY_POOL.length;
  const pick = DAILY_POOL[dayIdx];

  useEffect(() => {
    Promise.all([
      getChapters(),
      getVersesByChapter(pick.chapterId, { translationIds: [20] }),
    ]).then(([chapters, verses]) => {
      const v = verses.find((x: Verse) => x.verse_number === pick.ayah);
      const ch = chapters.find((c) => c.id === pick.chapterId);
      if (v)
        setVerse({
          arabic: v.text_uthmani,
          translation: v.translations?.[0]?.text?.replace(/<[^>]*>/g, "") ?? "",
          ref: `${pick.chapterId}:${pick.ayah}`,
          chapterName: ch?.name_simple ?? "",
        });
    });
  }, [pick.chapterId, pick.ayah]);

  return (
    <div className="min-h-screen geo-pattern bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-bold text-gold">
            QuranReels
          </Link>
          <Link to="/create" className="text-sm text-muted-foreground hover:underline">
            Editor →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-2 text-center text-xs uppercase tracking-widest text-accent">
          Verse of the day · {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 className="mb-10 text-center font-display text-4xl font-bold">
          {verse?.chapterName || <Skeleton className="mx-auto h-10 w-56" />}
        </h1>

        <div className="rounded-2xl border border-border bg-card/70 p-8 shadow-2xl backdrop-blur">
          {verse ? (
            <>
              <div
                dir="rtl"
                className="mb-6 text-center font-arabic text-4xl leading-loose sm:text-5xl"
              >
                {verse.arabic}
              </div>
              <p className="text-center text-lg text-muted-foreground">"{verse.translation}"</p>
              <div className="mt-4 text-center text-sm text-accent">— {verse.ref} —</div>
            </>
          ) : (
            <div className="space-y-4">
              <Skeleton className="mx-auto h-12 w-full" />
              <Skeleton className="mx-auto h-4 w-3/4" />
            </div>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            to="/create"
            search={{ p: undefined, id: undefined }}
            onClick={() => {
              // preselect via localStorage marker — the editor will honor this
              try {
                localStorage.setItem(
                  "quranreels:daily-preselect",
                  JSON.stringify({ chapterId: pick.chapterId, ayah: pick.ayah }),
                );
              } catch {}
            }}
          >
            <Button size="lg" className="bg-accent text-accent-foreground hover:opacity-90">
              Make video from this verse →
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
