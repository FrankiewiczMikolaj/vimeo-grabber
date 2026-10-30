# Changelog

Notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Prepared source version: **0.4.0**. No 0.4.0 tag or release is published.

### Added

- Native separate video/audio downloads, Audio only and safe Linux ffmpeg commands
  using actual completed paths; no in-extension mux.
- Progressive MP4 choices with declared sizes when available, saved as one combined file.
- First-use rights acknowledgement, per-tab unique-video badge counts and automatic
  Vimeo iframe/private-link discovery on other sites.
- Per-file Cancel/Retry, completed-companion retention and source-tab-independent
  admitted downloads owned by a dedicated download tab.
- Refresh for current-tab metadata and distinct restricted/private access feedback.
- Identified PR and main CI packages and an own-machine testing guide.

### Changed

- Independent playback candidates retain alternatives; clear separate DASH takes
  precedence over HLS without combining tracks from different sources.
- Required all-sites host access replaces optional per-CDN prompts; non-Vimeo
  pages expose only Vimeo iframe/link references to detection.

### Fixed

- Native Save As waits for completion/cancellation without a network timeout.
- Safe title filenames and merge output preserve original titles and actual native
  collision paths. Consent is checked independently at download and Copy boundaries.
- Partial config captures retain usable live sources; observer updates reach existing
  subscriptions without losing same-document changes.

## [0.3.0] - 2026-10-27

Published as a pre-release, **M2 Detection**; no prebuilt extension ZIP asset.

### Added

- Vimeo config, HLS and DASH metadata detection and live-frame quality listing.
- Offline cross-frame Chromium detection proof. This release does not download media.

## [0.2.0] - 2026-10-27

Published as a pre-release, **M1 Walking skeleton**.

### Added

- Walking skeleton for Vimeo discovery and the extension popup.

## [0.1.0] - 2026-10-27

Published as a pre-release, **M0 Foundation**.

### Added

- TypeScript/Vite MV3 foundation, CI and Chromium harness.

[Unreleased]: https://github.com/FrankiewiczMikolaj/vimeo-grabber/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/FrankiewiczMikolaj/vimeo-grabber/releases/tag/v0.3.0
[0.2.0]: https://github.com/FrankiewiczMikolaj/vimeo-grabber/releases/tag/v0.2.0
[0.1.0]: https://github.com/FrankiewiczMikolaj/vimeo-grabber/releases/tag/v0.1.0
