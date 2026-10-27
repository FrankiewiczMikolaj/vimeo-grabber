---
opened: 2026-10-28
---

# F026 · One quality click saves video and matching audio

## Outcome

Each supported quality has one “Download 720p”-style button that saves video and its best matching compatible audio as two separate files. “Audio only” saves exactly one file. This implements issue #45 using the owner-merged source-bound Track references; Linux command formatting remains the following issue #43 and must use both actual completed paths.

## Scope

- Begin at popup candidate rendering and the approved dedicated download-page boundary in `docs/M3-DOWNLOAD.md`; preserve detection and independent permission states.
- Match audio within the selected candidate and HLS audio group using declared defaults and quality metadata, never unrelated tracks.
- Resolve supported plain HLS media playlists and existing ordered references; assemble initialization before media without mixing tracks or downloading fragments as user files.
- Revalidate source, document and exact-origin authority at use; reject redirects, protected/encrypted inputs and unsupported forms without keys or credentials.
- Use bounded, disk-backed temporary storage owned by a dedicated extension page; popup closure must not interrupt ownership. Clean owned temporary data and recover orphan cleanup.
- Report native download progress, completion and partial failure; retain the completed file and actual absolute paths for the subsequent command feature.

## Out of scope

- In-extension mux, transcoding, other platforms or OS tabs.
- Live Vimeo access in tests, DRM bypass, keys/licenses or wildcard grants.
- ffmpeg command formatting (#43) and first-use disclaimer (#44).

## Acceptance

- One real quality-button click produces exactly two completed browser downloads with safe distinct names and exact owned fragmented-media bytes, including initialization-first ordering.
- Matching stays candidate/group-bound; clear HLS video plus separate audio works when DASH is protected, while missing/in-band/combined audio does not masquerade as a pair.
- Audio only completes exactly one audio file and creates no video, fragment downloads or paired result.
- A running companion shows progress; a failed/cancelled/timed-out companion shows partial failure identifying both outcomes, preserves the completed file and never reports paired success.
- Actual Chromium proof covers popup closure, permission denial/revocation and source invalidation without successful unauthorized or protected downloads; temporary data is cleaned.
- Local `pnpm verify` passes before every push; the M3 draft retains inspected real-browser evidence and passing Verify extension/CodeQL checks.

## Notes

Issue #45 and its live DRM/HLS comment are authoritative. Bob performs live checks only after the draft is ready; Mikołaj chooses a non-DRM DASH example. Keep the change quick to review without omitting acceptance or adding a placeholder command.
