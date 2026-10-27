---
opened: 2026-10-27
---
# F024 · Every Vimeo playback candidate keeps its own result and permission state

## Outcome

A working HLS result no longer hides DASH or its extra CDN-origin permission request. Users can resolve every recognised playback candidate and see separate DASH video/audio preferred when available, without losing usable HLS results. This implements issue #41 under the merged M3 plan.

## Scope

- Start at the video-level first-success checks in src/detect/resolve.ts and the popup permission visibility derived from that collapsed result.
- Retain every distinct protocol/CDN/manifest alternative from supported config paths and live frames, preserving candidate and source identity.
- Give candidates independent resolution/protection/failure/permission state; share an actual grant only between references on the same exact origin.
- Migrate the canonical contract through resolution, frame aggregation and popup without compatibility shims or mixed-source track groups.
- Keep fallback finite and metadata-only; update offline Chromium coverage and candidate documentation.

## Out of scope

- Track download URL/init/segment fields (#42), media downloads (#45), ffmpeg (#43) and the install notice (#44).
- New broad host access, key/license retrieval, live Vimeo in CI, retries or unrelated UI redesign.

## Acceptance

- An owned HLS-first fixture shows usable HLS tracks while a different DASH CDN origin remains visibly requestable.
- A real exact-origin grant resolves that DASH candidate and prefers its separate video/audio while retaining HLS.
- Denying or revoking DASH affects only the relevant origin/candidates; HLS remains usable.
- Multiple CDN entries and config/frame discoveries cannot erase a distinct candidate or confuse its identity/provenance.
- Owned malformed/protected cases remain local to a candidate; every unexpected/media request fails offline proof and signed queries are not logged.
- Actual real-action Chromium screenshots and local pnpm verify pass before push; the small M3 draft has both required checks inspected and a precise Bob live-check handoff.
