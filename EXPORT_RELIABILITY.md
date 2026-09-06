# Export reliability repair — review before deployment

Based on main at `719c26f5d022d9502202cd89db0e070ea679a8f6`.

## Scope

Focused repair of the background sampling, MP4 encoding and compatibility-recording paths. This is not a completed whole-site redesign or a guarantee that every reported black frame has been reproduced. The production app and the user's original failing output were not available for an end-to-end reproduction.

## Changes

- Replace the custom progressive-MP4 parser/decoder with browser-managed demuxing and bounded seeking before `VideoFrame` capture. Fixes stale loop-state behavior and avoids retaining whole compressed files/sample tables in JavaScript.
- Bound encoder queue waits, media waits, audio loading, frame rendering and finalization. Propagate errors and cancellation instead of waiting indefinitely.
- Share an offline audio mix between MP4 and MediaRecorder. Honor audio speed and fade toggles; trim exactly at the selected ayah boundary so the next ayah does not leak into the outro.
- Reject missing/failed audio rather than returning a silent success.
- Give compatibility recording an independent AudioContext clock and export-owned audio tracks. Avoid comparing source-timeline seconds with wall-clock duration at 0.75x, and avoid getting stuck when source audio ends before the outro.
- Probe AAC support; close frames, encoders and recording tracks on failure; reject empty output. Keep the final partial video frame rather than rounding down duration.
- Detect hidden tabs, suspended audio, resolution changes and very slow frames during real-time compatibility recording, with actionable failures rather than knowingly offering a frozen file.

## Tradeoffs / remaining work

- Browser seeking prioritizes correctness, not maximum export throughput. Long-GOP backgrounds can be slower than the old sequential decoder. Benchmark representative clips before deployment; a maintained demuxer would be a better long-term acceleration path than a handwritten parser.
- Compatibility recording now requires `CanvasCaptureMediaStreamTrack.requestFrame` and OfflineAudioContext. Test Safari/mobile explicitly; unsupported configurations fail with guidance rather than silently creating poor output.
- AbortSignal support exists in the export API. The current Step5 UI still does not pass a signal or show a Cancel button; wiring a complete export lifecycle and disabling editor changes remains follow-up work.
- PreviewCanvas still owns the legacy fallback seeker, background/verse readiness, caches and global decoder lifetime. Those need a separate lifecycle refactor, especially for failed/CDN-blocked media, font changes, unmounts and repeated exports.
- Audio decoding still loads the full chapter file; the 10-minute output guard is not a full memory budget for long source recitations.
- No billing, authentication, storage, database, navigation or visual-design changes are included.

## Validation

Run the dependency-free regression suite with Node.js 22.13+ or 24:

```sh
node scripts/test-export.mjs
```

It covers looping/backward timestamps, 0.75x conversion, bounded waits, cancellation, encoder failures, seek readiness, frame ownership and selected-ayah audio trimming/failure propagation.

During development: 11 regressions passed; both exporter entry points bundled with the muxer external; runtime and sampler passed isolated strict TypeScript checks. A generated two-color H.264 fixture also passed browser pixel checks for five forward, looped and backward samples. These are targeted checks, not a complete production build or a validated final MP4.

## Required before merging

- [ ] Install the repository's locked dependencies and run the full build and lint commands.
- [ ] Export a real recitation at 1x and 0.75x; verify duration, verse alignment and no next-ayah leakage.
- [ ] Test video loops, custom images, per-ayah backgrounds and generated themes.
- [ ] Test 720p/1080p and all aspect ratios, with and without ambient audio.
- [ ] Inspect the actual downloaded MP4/WebM and listen to its audio; use ffprobe and blackdetect for additional diagnostics.
- [ ] Test missing assets, slow network, tab visibility, retry after failure and repeated exports.
- [ ] Test Chrome/Edge, Safari and a representative mobile device.
- [ ] Confirm the original reported problem is fixed using the same settings and source clips.

Keep changes on a review branch until these checks are complete. Do not rewrite published history.
