---
opened: 2026-10-27
landed: 2026-10-28
---
# F025 · Tracks expose explicit download references with ordered initialization

## Outcome

A selected Track carries explicit, source-bound download references rather than only display metadata. The future downloader can distinguish a media playlist, initialization data and ordered media resources without guessing that a master manifest or base directory is a file. This implements issue #42; no download starts in this slice.

## Scope

- Extend the canonical Track contract and migrate affected parsers, resolver, runtime serialization and tests without compatibility aliases.
- Resolve DASH JSON response URL, manifest base, stream base and segment reference in that order, preserving standard relative/query semantics and candidate provenance.
- Retain inline base64 initialization distinctly from URL initialization; keep its ordering before media and never fetch it as a URL.
- Expose usable HLS variant/separate-audio playlist locators and declared supported MPD resources with explicit reference kinds; unknown/unsafe/unsupported resources remain honest, not guessed.
- Preserve candidate/audio-group association, protection decisions and the issue #41/#45 live notes; URL validation is not fetch authorization.

## Out of scope

- Actual init/segment/media downloads, file assembly, Downloads API permissions or extension download-page activation (#45).
- ffmpeg, one-time notice, live network tests, broader hosts and protection bypass.

## Acceptance

- Owned DASH JSON fixtures assert exact stacked relative/absolute resource URLs and initialization-before-media ordering, including signed-query cases.
- HLS video and separate audio retain their own playlist locators and matching group; missing URI or combined media does not invent a separate file.
- Owned MPD fixtures expose exact supported resource references; malformed/unsupported forms never fabricate a media URL.
- Missing init affects download eligibility, never DRM classification; actual protected candidates are not made downloadable.
- Compiled offline Chromium proof preserves the references through the actual candidate/Track contract with zero media/key/license requests and no raw signed-query logging.
- Local pnpm verify passes before each normal push; the small M3 Download draft has required checks inspected and clearly records any live-check prerequisite.
