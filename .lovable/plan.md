# QuranReels Pro — Build Plan

A Quran verse video generator with a 5-step wizard, MP4 export, and 4 pages. Design system, palette, and typography per your spec (dark-first, emerald/gold, Playfair + Inter, Arabic RTL).

## Scope & Priorities

Because of the size, I'll build in a strict order — end-to-end pipeline first, polish second. If any single feature can't reasonably fit in an MVP (e.g. word-level timing accuracy on every reciter), I'll ship a working approximation and flag it, rather than blocking the build.

**Phase 1 — Preview/export pipeline (highest priority)**
- Verse selection → Reciter → Style → Live preview with synced audio → MP4 export
- ffmpeg.wasm export with WebM/MediaRecorder fallback
- Everything else stubbed but navigable

**Phase 2 — Full editor breadth**
- All 15 themes, all text controls, translations, transliteration, layout presets, animation styles
- Adjustments (darkness/blur/vignette/grain/Ken Burns), watermark, frames
- Aspect ratios + resolutions

**Phase 3 — Surrounding pages & polish**
- Landing (hero, features, how-it-works, gallery, FAQ, footer)
- My Projects (localStorage-backed)
- Verse of the Day (deterministic by date)
- Surprise Me, share link, recent styles, caption generator
- Skeletons, toasts, error states, responsive mobile stepper, light-mode toggle

## Pages / Routes

```
/                → Landing
/create          → 5-step wizard (main app)
/projects        → Saved drafts grid
/daily           → Verse of the Day
```

## Technical Approach

- **Data**: Quran.com API v4 (`api.quran.com/api/v4`) — chapters, verses (`text_uthmani`), translations, recitations, word-timing where available. Surah list cached in localStorage.
- **Storage**: All projects as JSON in localStorage under `quranreels:projects`. Schema designed for later Supabase migration (each project already has a UUID, timestamps, and versioned settings blob).
- **Preview**: A `<canvas>` sized to selected aspect ratio, rendered via `requestAnimationFrame`. Background video drawn each frame, text layers composited on top with CSS-like transforms. Audio is a separate `<audio>` element synced by `currentTime`.
- **Export**:
  1. Capture canvas frames at 30fps into an in-memory buffer while playing the audio silently.
  2. Feed frames + audio into `ffmpeg.wasm` → MP4 (H.264 + AAC).
  3. On any failure, fall back to `MediaRecorder` on `canvas.captureStream()` merged with an `AudioContext` destination stream → WebM. Toast informs the user of the fallback format.
- **Themes**: Free Pexels/Coverr `.mp4` URLs for 13 stock loops + 2 canvas-generated (dark gradient, gold particles). Preloaded and validated before Export button enables.
- **Fonts**: Google Fonts `<link>` in `__root.tsx` head — Playfair Display, Inter, Amiri, Scheherazade New, Noto Naskh Arabic, Lateef. KFGQPC Uthmani via a CDN webfont URL.
- **RTL**: Arabic text always in a wrapper with `dir="rtl"` and correct font stack; never split characters.

## Design System (src/styles.css)

- `--background: oklch(0.14 0.01 150)` (#0B0F0E-ish)
- `--primary: oklch(0.38 0.09 155)` (deep emerald #0F5132)
- `--accent: oklch(0.75 0.13 85)` (gold #C9A227)
- `--foreground: oklch(0.95 0.02 85)` (off-white #F5F1E8)
- Islamic-geometric SVG as low-opacity `background-image` utility class
- Custom shadcn button variants: `hero` (gold), `emerald`, `ghost-gold`
- Skeleton, toast (sonner), accordion (radix) — all themed

## File Layout (new)

```
src/routes/
  index.tsx                    (landing — rewritten)
  create.tsx                   (wizard shell)
  projects.tsx
  daily.tsx
src/components/
  landing/{Hero,Features,HowItWorks,Gallery,FAQ,Footer}.tsx
  wizard/
    WizardShell.tsx            (stepper + canvas + nav)
    Step1Verse.tsx
    Step2Reciter.tsx
    Step3Text.tsx
    Step4Style.tsx
    Step5Export.tsx
    PreviewCanvas.tsx          (canvas renderer)
    useProjectState.ts         (zustand-like context)
  ui/*                          (existing shadcn)
src/lib/
  quran-api.ts                 (fetch + cache)
  themes.ts                    (15 theme definitions)
  reciters.ts
  translations.ts
  fonts.ts
  export/
    ffmpeg-export.ts
    mediarecorder-export.ts
    frame-capture.ts
  projects-store.ts            (localStorage CRUD)
  caption.ts                   (share caption generator)
src/assets/patterns/geometric.svg
```

## Known Trade-offs

- **Word-level animation** uses Quran.com per-word timing when the reciter provides it; otherwise falls back to per-ayah fade. Not every reciter has segments.
- **ffmpeg.wasm** is ~30MB; loaded lazily on Step 5 only, with a progress indicator.
- **Reciter photos** are placeholder gradient avatars with initials (no reliable free photo source).
- **Share preview link** encodes project JSON into the URL (base64) — no server needed; long URLs are acceptable for this MVP.
- **Custom uploads** validated client-side (image ≤10MB, video ≤50MB, mp4/webm/jpg/png).
- **Auth / cloud sync**: out of scope for this build; code structured so a later `projects-store` swap to Supabase is a single-file change.

## Verification Before I Finish

1. Landing page renders with hero video mockup and all sections.
2. `/create` wizard walks through all 5 steps with state persisted.
3. Live preview plays audio synced with Arabic + translation on a themed video background.
4. Export produces a downloadable MP4 (or WebM fallback) with correct aspect ratio.
5. Project saves to `/projects`, reloads, duplicates, deletes.
6. `/daily` shows a deterministic verse and "Make video" deep-links into `/create` with that verse preselected.
7. Mobile viewport: editor collapses to bottom-tab stepper with preview pinned top.
8. No hardcoded colors in components — all via design tokens.

Once you approve, I'll start with the design system + routing shell, then the wizard skeleton + preview canvas, then export, then landing/projects/daily, then polish.
