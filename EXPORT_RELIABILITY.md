# Export reliability

## September 6: oversized Pixabay and renderer integration repair

Built on main `4a8f2f230c115634a648199f8964d9f9f515f567`. This is a targeted rendering repair, not a whole-site redesign or a claim that every device/source has been validated.

### Current changes

- Select a real Pixabay rendition using dimensions and reported byte size, preferring <=1920px long edge and <=80 MiB instead of always selecting `large`. If all options exceed that preference, choose the smallest available real rendition. This is a selection preference, not a universal download-size guarantee.
- Resolve existing saved/shared Pixabay `_large.mp4` links by video ID through the configured Pixabay API. Do not guess alternate filenames. Cache successful lookups briefly. If no API key is configured, retain the original source; failed configured lookups report an error.
- Use one background video element for preview and export. The UI no longer starts the optional duplicate decoder/download or uses its legacy 250ms success-on-timeout fallback.
- Await background readiness before computing loop positions or encoding. Pause the video and await a completed, drawable seek for every exported frame. Missing/failed frames reject the export instead of silently painting a dark fallback.
- Own the canvas for the entire export, including audio preparation and encoder waits. The preview rAF cannot repaint after a 1.5-second gap. The same lifecycle wraps both MP4 and compatibility export.
- Prevent late asset events from restarting a video during export. Cancel obsolete loads on selection changes/unmount; show loading/error states and a retry action.
- Cache only successful compositions. Thumbnail capture cannot race an active export.
- Initialize/resume AudioContext synchronously within the Render action, before asynchronous preparation consumes the user gesture.

### Validation performed

Dependency-free suites (Node 22.13+ or 24):

```sh
node scripts/test-export.mjs
node scripts/test-background-timeouts.mjs
node scripts/test-background-media.mjs
```

All 32 tests passed (11 existing export tests, 8 older sampler timeout tests, 13 new background tests). The negative-control test reproduces the old seeker returning successfully while its frame is still unavailable. New tests cover delayed loading/seeking, no duplicate video creation, loop/backward seeks, abort/disposal, autoplay exclusion, oversized rendition selection and API-based legacy URL resolution. The old sampler tests remain for compatibility; PreviewCanvas no longer uses that sampler.

The changed media helpers passed an isolated strict TypeScript check. The actual PreviewCanvas and export entry bundled in an isolated browser harness with mocked data services.

A real browser test using a generated moving H.264 clip with B-frames passed:

- Different source timestamps produced different background pixels; looping returned to matching pixels.
- A frame remained unchanged throughout a 2.2-second export hold despite the preview rAF.
- Injected draw failure rejected, and retrying the same timestamp redrew successfully.
- The actual compatibility export completed at 1080p/1x and 720p/0.75x using VP9/Opus WebM. Background pixels sampled during composition were not missing/black.
- An unavailable clip rejected export with a visible error; switching back to a valid clip recovered.

The harness forced the compatibility capability decision; it did not validate the production MP4 muxer. Final-file frame-by-frame decoding/visual inspection was not completed. This is not a full app build, a test of the exact remote Pixabay file, or proof of a successful Lovable deployment.

## Earlier repairs retained

The earlier export work added bounded queue/media/audio/encoder waits, cancellation propagation, resource cleanup, even output dimensions, final partial-frame retention and H.264/AAC capability checks. Both exporters share an offline mix that honors speed/fades and stops recitation at the selected ayah boundary. Compatibility recording uses an independent audio clock and export-owned tracks, detects hidden/suspended/stalled conditions, and rejects empty output.

## Remaining validation and limits

- Full locked-dependency build/lint and production MP4 validation still need an environment with the repository dependencies.
- The exact remote 334 MB Pixabay asset could not be retrieved from the development environment. Live Pixabay API/CDN behavior and Lovable deployment were not verified.
- Browser seeking can be slower for long-GOP or poorly buffered videos. Compatibility recording may reject a source too slow for real-time export. This change is not a server-side transcoder.
- Safari/mobile, all aspect ratios/frame styles, per-ayah transitions, images/generated themes, ambient audio and real-recitation alignment still need wider end-to-end coverage.
- The export API accepts AbortSignal, but Step5 still has no Cancel button. Changes to background selection cancel an active export rather than corrupting it.
- Full source chapter audio is still decoded into memory. The ten-minute output limit is not a complete memory budget.
- API keys prefixed VITE_* remain public client configuration; a server proxy is separate work.
- Billing, authentication, database schema and published git history were not changed. Never force-push or rewrite Lovable-connected history.
