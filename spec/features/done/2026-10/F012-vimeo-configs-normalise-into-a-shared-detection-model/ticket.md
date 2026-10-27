---
opened: 2026-10-27
landed: 2026-10-27
---

# F012 · Vimeo configs normalise into a shared detection model

## Outcome

Contributors can normalise realistic Vimeo player configs into one typed metadata contract for subsequent detection and track parsers. Owned fixtures replace assumptions from the M1-only dummy contract without claiming live Vimeo compatibility.

## Scope

- Start in src/detect with a shared video/manifest/track/status model and a pure config-normalisation API.
- Recognise actual-shaped video identity/title and request.files DASH/HLS CDN descriptors; keep usable alternatives when another descriptor is malformed.
- Author a small owned config fixture corpus with dummy identities and signed-query values, and document the exported integration contract.
- Leave the working M1 runtime intact until the approved popup cutover; do not create a second competing production detector.

## Out of scope

- DOM/page discovery, fetching, permissions, frame aggregation and popup changes.
- Manifest parsing, media downloads, real tokens/cookies, or live network tests.

## Acceptance

- Owned configs normalise to their declared video identity, title and usable DASH/HLS references without hard-coded fixture results.
- Valid URL query data survives normalisation, and malformed/unsupported fields cannot fabricate a video or erase valid alternate descriptors.
- The shared model distinguishes video/audio/combined tracks and unknown metadata without guessing qualities.
- Behavioral unit checks and a real Chromium execution of the compiled normaliser prove config-derived results offline.
- pnpm verify passes before push; the draft targets latest main with milestone M2 Detection and both required checks are observed.
