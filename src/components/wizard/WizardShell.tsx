import { useRef, useState } from "react";
import { PreviewCanvas, type PreviewHandle } from "./PreviewCanvas";
import { Step1Verse } from "./Step1Verse";
import { Step2Reciter } from "./Step2Reciter";
import { Step3Text } from "./Step3Text";
import { Step4Style } from "./Step4Style";
import { Step5Export } from "./Step5Export";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, ChevronRight, Play, Pause, Sparkles } from "lucide-react";
import { useProjectState } from "@/lib/project-state";
import { RECITERS } from "@/lib/reciters";
import { THEMES } from "@/lib/themes";

const STEPS = [
  { id: 1, title: "Verse", desc: "Pick a surah and ayahs" },
  { id: 2, title: "Reciter", desc: "Voice and audio" },
  { id: 3, title: "Text", desc: "Fonts and layout" },
  { id: 4, title: "Style", desc: "Background and effects" },
  { id: 5, title: "Export", desc: "Preview and render" },
];

export function WizardShell() {
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const previewRef = useRef<PreviewHandle>(null);
  const { update, settings } = useProjectState();

  const togglePlay = async () => {
    if (!previewRef.current) return;
    if (playing) {
      previewRef.current.pause();
      setPlaying(false);
    } else {
      await previewRef.current.play();
      setPlaying(true);
    }
  };

  const surpriseMe = () => {
    const randReciter = RECITERS[Math.floor(Math.random() * RECITERS.length)];
    const randTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
    const pool = [
      { chapterId: 36, fromAyah: 1, toAyah: 3, name: "Ya-Sin" },
      { chapterId: 55, fromAyah: 1, toAyah: 4, name: "Ar-Rahman" },
      { chapterId: 93, fromAyah: 1, toAyah: 5, name: "Ad-Duha" },
      { chapterId: 94, fromAyah: 1, toAyah: 4, name: "Ash-Sharh" },
      { chapterId: 103, fromAyah: 1, toAyah: 3, name: "Al-Asr" },
      { chapterId: 112, fromAyah: 1, toAyah: 4, name: "Al-Ikhlas" },
    ];
    const rv = pool[Math.floor(Math.random() * pool.length)];
    update({
      chapterId: rv.chapterId,
      chapterName: rv.name,
      fromAyah: rv.fromAyah,
      toAyah: rv.toAyah,
      reciterId: randReciter.id,
      themeId: randTheme.id,
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <a href="/" className="font-display text-xl font-bold text-gold">
            QuranReels
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={surpriseMe}>
              <Sparkles className="mr-1 h-4 w-4" /> Surprise me
            </Button>
            <a
              href="/projects"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              My projects
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr_420px]">
        {/* Stepper */}
        <aside className="hidden lg:block">
          <ol className="space-y-1">
            {STEPS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                    step === s.id
                      ? "border-accent bg-accent/10"
                      : "border-transparent hover:bg-card"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold ${
                      step > s.id
                        ? "bg-accent text-accent-foreground"
                        : step === s.id
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.id ? <Check className="h-3 w-3" /> : s.id}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{s.desc}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* Preview (top on mobile, right column on desktop) */}
        <section className="order-1 lg:order-3">
          <div className="sticky top-20 rounded-2xl border border-border bg-card p-3">
            <PreviewCanvas ref={previewRef} onProgress={setTime} />
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={togglePlay}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                {settings.chapterName} — {settings.chapterId}:{settings.fromAyah}
                {settings.toAyah !== settings.fromAyah ? `-${settings.toAyah}` : ""}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {time.toFixed(1)}s
              </div>
            </div>
          </div>
        </section>

        {/* Step content */}
        <section className="order-2 lg:order-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">
              Step {step}: {STEPS[step - 1].title}
            </h2>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            {step === 1 && <Step1Verse />}
            {step === 2 && <Step2Reciter />}
            {step === 3 && <Step3Text />}
            {step === 4 && <Step4Style />}
            {step === 5 && <Step5Export preview={previewRef} />}
          </div>

          <div className="mt-4 flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={step === 5}
              className="bg-accent text-accent-foreground hover:opacity-90"
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>

      {/* Mobile stepper */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`py-3 text-[10px] font-medium ${
              step === s.id ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <div className="mx-auto mb-0.5 grid h-6 w-6 place-items-center rounded-full bg-muted text-xs">
              {s.id}
            </div>
            {s.title}
          </button>
        ))}
      </nav>
    </div>
  );
}
