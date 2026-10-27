---
opened: 2026-10-27
---

# F009 · The popup lists and downloads a fixture stream

## Outcome

On the synthetic Vimeo page, users open Vimeo Grabber and see its one dummy stream. Selecting download saves the declared dummy file through Chromium Downloads API, completing the visible M1 interaction without implying real Vimeo downloading.

## Scope

- Start from the merged fixture detector and the existing popup entry.
- Keep detect, download, and UI modules separate; use only the permissions required for the chosen active-tab detection and download path.
- Render one stream safely and provide an English empty/error state for unsupported pages.
- Preserve the own-risk/content-rights footer and identify synthetic behavior honestly.

## Out of scope

- Real Vimeo extraction, audio/video quality selection, muxing, ffmpeg, and extra platform support.
- Release tags, dependency refresh, and unrelated UI redesign.

## Acceptance

- The popup on the synthetic Vimeo page shows the declared stream title and a working download control.
- The user action calls the real Downloads API and produces the expected dummy filename and bytes, with failures visible rather than reported as success.
- Unsupported pages do not show the fixture stream or initiate a download.
- The necessary manifest boundary tests are updated to the actual least-privilege contract, not deleted to hide permission regressions.
- Local pnpm verify passes before push; the small M1 draft targets latest main and both required checks are inspected.
