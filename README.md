# Quran Reel Creator

Build "QuranReels Pro" — a complete Quran verse video generator web app for creating stunning, shareable videos for TikTok, Instagram Reels, and YouTube Shorts.
1. Pages & Structure

Landing page: Hero with autoplaying muted example video in a phone mockup frame, headline "Turn Quran verses into beautiful videos in seconds", CTA button "Create Video". Below: features grid (6 cards with icons), "How it works" 3-step section, gallery of 6 example style previews, FAQ accordion, footer with links.
Editor page (/create): The main wizard, described below.
My Projects page (/projects): Grid of saved drafts with thumbnail, verse reference, date, duplicate/delete buttons.
Verse of the Day page (/daily): A daily rotating verse with one-click "Make video from this".

2. Editor Wizard (5 steps, left sidebar stepper + main canvas)
Step 1 — Verse Selection:

Searchable dropdown of all 114 surahs showing Arabic name, English name, and number (e.g. "2. Al-Baqarah — البقرة").
Ayah range picker: "From ayah X to ayah Y" with validation (max 10 ayahs per video, show warning if audio exceeds 90 seconds).
Live Arabic text preview in Uthmani script with the selected translation underneath.
Search bar to find verses by keyword in translation (e.g. "patience" surfaces relevant ayahs).
Fetch data from Quran.com API v4 (api.quran.com/api/v4): chapters list, verses by chapter with text_uthmani, translations, and audio.

Step 2 — Reciter & Audio:

Card grid of reciters with photo placeholder, name in English + Arabic, and a play/pause preview button (previews the currently selected first ayah): Mishary Alafasy, Abdul Rahman Al-Sudais, Saad Al-Ghamdi, Maher Al-Muaiqly, Yasser Al-Dosari, Abdul Basit (Mujawwad + Murattal), Hani Ar-Rifai, Noreen Muhammad Siddique.
Audio speed control (0.75x, 1x) and optional 1s fade-in/fade-out toggles.
Optional soft background nasheed/ambient toggle at low volume (10–20% slider), with 3 royalty-free ambient options.

Step 3 — Text & Translation:

Arabic font picker with live preview: KFGQPC Uthmani, Amiri, Scheherazade New, Noto Naskh Arabic, Lateef.
Translation toggle + language: English (Saheeh International, Yusuf Ali, Pickthall), French, Urdu, Indonesian, Turkish, Spanish, German — pulled from Quran.com API translation resources.
Optional transliteration line toggle.
Per-text-layer controls: font size slider, color picker, letter spacing, line height, text shadow toggle, max width %.
Layout presets: "Centered stack" (Arabic on top, translation below), "Arabic only", "Bottom third", "Split top/bottom".
Text animation styles: word-by-word fade synced to audio timestamps (use Quran.com word-level timing data where available), full-verse fade in, typewriter, slide-up with blur, scale-in with glow. Animation speed control.

Step 4 — Visual Style:

Theme gallery (minimum 15 themes, each a card with looping preview) using free stock loops from Pexels/Coverr CDN URLs:
Rain on window at night, 2. Ocean waves aerial, 3. Night sky with stars/milky way, 4. Clouds timelapse, 5. Misty forest, 6. Desert dunes at sunset, 7. Mosque silhouette at maghrib, 8. Kaaba/Makkah crowd timelapse, 9. Snowfall, 10. Candle flame close-up, 11. Waterfall slow motion, 12. Mountain fog, 13. Animated dark gradient (CSS/canvas generated), 14. Animated gold particles on black, 15. Minimalist paper texture with subtle Islamic geometric pattern overlay.


Upload custom background (image or video, validate size/format).
Adjustments panel: overlay darkness slider (0–80%), blur slider, vignette toggle, film grain toggle, subtle slow zoom (Ken Burns) toggle.
Corner watermark: none / app logo / custom text (e.g. user's @handle) with position picker.
Optional decorative frame styles: thin gold border, Islamic arch frame, rounded corners.

Step 5 — Format & Export:

Aspect ratio: 9:16 (default), 1:1, 16:9, 4:5 — canvas preview resizes live.
Resolution: 720p / 1080p.
Live full preview with synchronized audio playback and a scrub bar before rendering.
Export to MP4 using ffmpeg.wasm (canvas frames + audio muxing); show a progress bar with percentage and estimated time, cancel button. Fallback to WebM via MediaRecorder if ffmpeg.wasm fails, with a notice.
After export: download button, "Save to My Projects", "Create another", and copy-caption button that generates a ready-made social caption with the verse reference and hashtags (#Quran #Islam #Reels).

3. Design System

Dark mode by default with light mode toggle.
Palette: near-black background (#0B0F0E), deep emerald (#0F5132), gold accent (#C9A227), off-white text (#F5F1E8).
Subtle Islamic geometric pattern as low-opacity background texture on landing sections.
Typography: elegant serif for headings (e.g. Playfair Display), clean sans for UI (Inter); Arabic always in proper RTL rendering.
Smooth transitions, skeleton loaders for API fetches, toast notifications for actions, and graceful error states ("Couldn't load recitation, try another reciter").
Fully responsive: on mobile the editor becomes a bottom-tab stepper with the preview pinned on top.

4. Data & Technical

Quran.com API v4 for chapters, verses, translations, word timings, and audio files; cache surah list in localStorage.
Save projects (all wizard settings as JSON) to localStorage; structure the code so Supabase auth + cloud saves can be added later.
Preload the selected audio and background video before enabling the Export button.
Handle RTL correctly everywhere Arabic appears; never break Arabic ligatures.
Keyboard accessible controls and alt text throughout.

5. Delight Features

"Surprise Me" button: random verse + random theme + random reciter in one click.
Verse of the Day on the homepage (deterministic by date).
Recently used styles remembered per user.
Share a read-only preview link of a project configuration.

Build the full flow working end-to-end first (verse → reciter → style → preview → export), then polish. Prioritize the preview/export pipeline above all else.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://divine-shorts.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d440865f-db4c-422d-8391-2424262a9209).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
