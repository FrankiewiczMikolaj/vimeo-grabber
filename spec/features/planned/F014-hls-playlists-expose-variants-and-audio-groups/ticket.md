---
opened: 2026-10-27
---

# F014 · HLS playlists expose variants and audio groups

## Outcome

Owned HLS manifests expose video variants and their audio groups through the shared M2 model. Combined streams and absent separate audio URIs are represented honestly rather than invented as downloadable tracks.

## Scope

- Start from the merged model and a pure HLS metadata parser.
- Parse master variants and EXT-X-MEDIA audio groups, including quoted commas, language/channels, codecs and relative URIs.
- Preserve group associations and optional metadata without guessing missing values.
- Use owned playlists and report advertised protection/unsupported forms without key or segment access.

## Out of scope

- DASH parsing, fetch broker, permission requests and UI integration.
- Media retrieval, decryption, muxing and real downloads.

## Acceptance

- Multi-quality/audio fixtures return the exact expected variants and linked audio groups.
- Quoted attributes and relative URLs parse correctly without corrupting explicit query data.
- Combined variants and absent audio URI do not create false separate tracks; malformed input cannot become successful detection.
- The actual parser runs offline in installed Chromium; pnpm verify passes before push.
- The small M2 draft branches from latest main and both required checks are inspected.
