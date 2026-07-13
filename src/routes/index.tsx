import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles,
  Music,
  Type,
  Palette,
  Wand2,
  Share2,
  Play,
  Download,
} from "lucide-react";
import { THEMES } from "@/lib/themes";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Gallery />
      <FAQ />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link to="/" className="font-display text-2xl font-bold">
          <span className="text-gold">QuranReels</span>{" "}
          <span className="text-xs uppercase tracking-widest text-accent">Pro</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a href="#features" className="text-muted-foreground hover:text-foreground">
            Features
          </a>
          <a href="#how" className="text-muted-foreground hover:text-foreground">
            How it works
          </a>
          <a href="#gallery" className="text-muted-foreground hover:text-foreground">
            Styles
          </a>
          <Link to="/daily" className="text-muted-foreground hover:text-foreground">
            Daily verse
          </Link>
          <Link to="/projects" className="text-muted-foreground hover:text-foreground">
            My projects
          </Link>
        </nav>
        <Link to="/create">
          <Button className="bg-accent text-accent-foreground hover:opacity-90">
            Create video
          </Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden geo-pattern">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col justify-center">
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
            <Sparkles className="h-3 w-3" /> Built for creators of the Deen
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight lg:text-6xl">
            Turn Quran verses into{" "}
            <span className="text-gold">beautiful videos</span> in seconds.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Pick a verse, choose a reciter, style your background — and export a
            share-ready video for TikTok, Reels, and YouTube Shorts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/create">
              <Button size="lg" className="bg-accent text-accent-foreground hover:opacity-90">
                <Play className="mr-2 h-4 w-4" />
                Create video
              </Button>
            </Link>
            <Link to="/daily">
              <Button size="lg" variant="outline">
                Today's verse
              </Button>
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
            <span>✓ 100+ recitations</span>
            <span>✓ 15+ themes</span>
            <span>✓ 9 translations</span>
          </div>
        </div>

        {/* Phone mockup */}
        <div className="relative flex items-center justify-center">
          <div className="relative aspect-[9/19] w-72 overflow-hidden rounded-[3rem] border-[10px] border-neutral-800 bg-black shadow-2xl">
            <video
              src="https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_30fps.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <div dir="rtl" className="font-arabic text-3xl leading-loose text-white">
                إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا
              </div>
              <div className="mt-4 text-sm text-white/80">
                "Indeed, with hardship comes ease."
              </div>
              <div className="mt-2 text-xs text-gold">— 94:6 —</div>
            </div>
            <div className="absolute inset-x-0 top-2 flex justify-center">
              <div className="h-5 w-24 rounded-b-2xl bg-neutral-800" />
            </div>
          </div>
          <div className="absolute -right-6 top-10 hidden rounded-xl border border-border bg-card p-3 shadow-xl lg:block">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Exporting…
            </div>
            <div className="mt-1 text-sm font-medium">1080p · 9:16 · MP4</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Music, title: "Choice reciters", desc: "Mishary, Sudais, Ghamdi, Al-Muaiqly, Abdul Basit and more." },
  { icon: Type, title: "Beautiful typography", desc: "Uthmani script, Amiri, Scheherazade, Noto Naskh and Lateef." },
  { icon: Palette, title: "15+ cinematic themes", desc: "Rain, ocean, Makkah, night sky, deserts, geometric patterns." },
  { icon: Sparkles, title: "Animations", desc: "Word-by-word synced to recitation, fades, slides, glow." },
  { icon: Download, title: "1-click export", desc: "MP4 or WebM at 720p/1080p in 9:16, 1:1, 16:9, 4:5." },
  { icon: Share2, title: "Share-ready", desc: "Copy captions with hashtags. Preview links to share edits." },
];

function Features() {
  return (
    <section id="features" className="border-y border-border/50 bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="font-display text-4xl font-bold">Everything you need to publish</h2>
          <p className="mt-3 text-muted-foreground">
            A serious editor built for da'wah creators.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 transition hover:border-accent/60"
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl gold-gradient text-gold-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-display text-xl font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: 1, title: "Pick a verse", desc: "Search or browse all 114 surahs, choose your ayahs." },
    { n: 2, title: "Style it", desc: "Reciter, theme, font, translation, animation — live preview." },
    { n: 3, title: "Export & share", desc: "Render to MP4 and post directly to your feeds." },
  ];
  return (
    <section id="how" className="mx-auto max-w-7xl px-4 py-20">
      <div className="mb-12 text-center">
        <h2 className="font-display text-4xl font-bold">Three steps to your first video</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="relative rounded-2xl border border-border bg-card p-8">
            <div className="absolute -top-4 left-6 grid h-9 w-9 place-items-center rounded-full gold-gradient font-display text-lg font-bold text-gold-foreground">
              {s.n}
            </div>
            <h3 className="mt-3 mb-2 font-display text-2xl font-semibold">{s.title}</h3>
            <p className="text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Gallery() {
  const featured = THEMES.filter((t) => t.video).slice(0, 6);
  return (
    <section id="gallery" className="border-y border-border/50 bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-10 text-center">
          <h2 className="font-display text-4xl font-bold">Choose from cinematic styles</h2>
          <p className="mt-3 text-muted-foreground">Fifteen looping backgrounds, or bring your own.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {featured.map((t) => (
            <div
              key={t.id}
              className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-border"
            >
              <img
                src={t.poster}
                alt={t.name}
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 flex flex-col justify-end p-4">
                <div className="font-display text-lg font-semibold text-white">{t.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    {
      q: "Is the Quran text authentic?",
      a: "Yes. Verses, translations, and recitations are pulled from Quran.com's open API, which sources verified Uthmani script and trusted translations.",
    },
    {
      q: "What formats can I export?",
      a: "MP4 or WebM (browser-dependent), at 720p or 1080p, in 9:16, 1:1, 16:9, or 4:5.",
    },
    {
      q: "Do I need an account?",
      a: "No. Projects save to your device. Cloud sync is coming later.",
    },
    {
      q: "Can I use my own background?",
      a: "Yes — upload any image or video up to 50MB.",
    },
    {
      q: "Is it free?",
      a: "The core editor is free to use. Please share with proper adab and don't misrepresent recitations.",
    },
  ];
  return (
    <section className="mx-auto max-w-3xl px-4 py-20">
      <h2 className="mb-8 text-center font-display text-4xl font-bold">FAQ</h2>
      <Accordion type="single" collapsible className="w-full">
        {items.map((it, i) => (
          <AccordionItem key={i} value={`i-${i}`}>
            <AccordionTrigger className="text-left">{it.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{it.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-10 md:flex-row md:items-center">
        <div>
          <div className="font-display text-xl font-bold text-gold">QuranReels Pro</div>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Turn Quran verses into beautiful videos. Made with adab.
          </p>
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link to="/create" className="hover:text-foreground">
            Editor
          </Link>
          <Link to="/daily" className="hover:text-foreground">
            Verse of the day
          </Link>
          <Link to="/projects" className="hover:text-foreground">
            My projects
          </Link>
          <a
            href="https://quran.com"
            className="hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Quran.com API
          </a>
        </div>
      </div>
    </footer>
  );
}
