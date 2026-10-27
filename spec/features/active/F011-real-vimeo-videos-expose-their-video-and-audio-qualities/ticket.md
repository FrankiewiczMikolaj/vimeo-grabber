---
opened: 2026-10-27
---

# F011 · Real Vimeo videos expose their video and audio qualities

## Outcome

Users see real Vimeo videos and their available video qualities and audio tracks in the popup, including Vimeo players embedded on other sites. Detection falls back across page, player, and later-loaded configuration instead of relying on one page shape. M2 targets v0.3.0; real media downloads remain M3.

## Scope

- Start from the existing detect/content/popup boundaries and replace the synthetic-only production contract through small complete slices.
- Discover inline configuration, player-frame configuration, and discovered or derived player-config URLs, including delayed availability.
- Read DASH and HLS manifest metadata into a shared video/audio track model; include Vimeo adaptive JSON and DASH MPD forms.
- Aggregate only Vimeo-origin frames for the active tab, deduplicate videos, and clear stale navigation results.
- Keep tests offline with owned, sanitised realistic configs, manifests, and third-party embed pages; use only justified permissions.
- Follow the delivery and permission decisions in docs/M2-DETECTION.md.

## Out of scope

- Real media/segment/key downloads, muxing, ffmpeg, and non-Vimeo detection.
- Authentication, DRM/privacy bypass, generic network interception, and broad site access.
- Store publication, release automation, and unrelated UI redesign.

## Acceptance

- Missing or unusable inline data falls back to a usable player/config path; delayed config becomes visible without duplicate videos.
- A non-Vimeo top page with a Vimeo iframe lists that video's qualities without permission to read the surrounding site; unrelated frames contribute nothing.
- DASH and HLS fixtures yield correct separate video/audio metadata, relative URL resolution, and audio grouping without invented qualities or tracks.
- The popup distinguishes pending, unavailable, permission-denied, and protected/unsupported results, and never offers a real media download.
- Default Chromium verification remains offline, proves fallback and cross-origin iframe detection, and fails any segment/key/media request or unexpected network access.
- Each small M2 draft passes local pnpm verify before push and both required PR checks before readiness notification; real-page compatibility evidence is separate from CI fixture proof.
