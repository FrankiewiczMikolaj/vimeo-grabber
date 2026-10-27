---
opened: 2026-10-27
---
# F023 · Users download separate Vimeo video and audio with a safe merge command

## Outcome

Users resolve all available Vimeo playback candidates, choose video and audio tracks, and save two correct files. The extension provides a safe Linux ffmpeg merge command and the missing first-use rights notice. The owner-approved issue order and technical boundary are in docs/M3-DOWNLOAD.md.

## Scope

- Start with independent DASH/HLS candidates and per-origin permission state (#41), then explicit Track download references (#42).
- Save selected tracks separately with correct init/segment ordering (#45), then generate the Linux command (#43).
- Finish the one-time disclaimer acknowledgement while retaining the footer (#44).
- Keep offline fixture proof as CI truth and request Bob's live checks for candidate resolution and downloaded files.

## Out of scope

- Other platforms, in-extension mux, authentication/privacy/DRM bypass and media-key retrieval.
- Windows/macOS shell backends, store publication, broad grants and unrelated UI redesign.

## Acceptance

- HLS success cannot hide another DASH candidate or its exact-origin permission request; separate DASH tracks are preferred when available.
- Manifest, stream and segment bases resolve in order; selected files contain init bytes first and ordered media bytes afterward.
- Real Chromium completes distinct usable video/audio files without tying byte lifetime to the popup.
- The Linux command safely quotes actual absolute paths, includes install/version guidance and merges owned synthetic files successfully.
- Fresh installs show the notice once; acknowledged installs retain it across updates without hiding the footer.
- Small drafts pass local pnpm verify and required CI; Bob's requested live results are recorded separately from offline proof.
