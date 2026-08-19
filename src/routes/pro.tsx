import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";

// This app has no paid tier and no payment processor. The route is kept so
// that any existing bookmarks or inbound links resolve instead of 404-ing.

const INCLUDED = [
  "1080p HD and 720p export in 9:16, 1:1, 16:9 and 4:5",
  "Full watermark control — customise it or turn it off entirely",
  "100+ recitations and 9 translations",
  "15+ cinematic themes, or bring your own image or video",
  "Word-by-word animation synced to the recitation",
  "Localised titles, descriptions and hashtags for every platform",
];

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "Everything is free — QuranReels" },
      {
        name: "description",
        content:
          "Every QuranReels feature is free, including 1080p HD export and watermark-free videos.",
      },
    ],
  }),
  component: ProPage,
});

function ProPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 py-14">
        <div className="rounded-2xl border border-gold/40 bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-3 h-12 w-12 text-gold" />
          <h1 className="font-display text-3xl font-bold">Everything is free</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            There is no Pro plan, no subscription and nothing to pay for. Every
            feature is unlocked for everyone.
          </p>

          <ul className="mx-auto mt-6 space-y-2 text-left">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-accent" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <Link to="/create" className="mt-8 inline-block">
            <Button size="lg" className="bg-accent text-accent-foreground">
              Start creating
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
