# Vision

> Human-owned durable intent for every role. Keep this file compact and decision-useful. The coordinator may propose changes but does not invent or rewrite this intent unprompted.

## Product principles

- **Vimeo Grabber** (`vimeo-grabber`) is a Vimeo-only Chromium MV3 extension. No other video sites will ever be added.
- English UI only.
- MVP: detect and list Vimeo videos, download separate video and audio files, and show a copy-ready Linux ffmpeg merge command (safe quoting, absolute paths, install hint). No in-extension mux.
- Users install and use at their own risk. Users alone are responsible for having rights to any content they download. The author and contributors are not liable. Ship this in DISCLAIMER.md, README Legal section, one-time in-extension notice, popup footer, and GitHub Pages.
- v1.0.0 officially supports Linux only for merge/tests (bash/zsh). Windows and macOS ShellBackends and OS tabs are v1.1+ on ROADMAP.md and a Projects backlog — still Vimeo-only.
- Publish **only** through GitHub Releases (attested zip). Never publish to the Chrome Web Store or Edge Add-ons.
- MIT license.
- Calling-card quality: professional commits, docs, tests, legal copy, UI/UX, and full GitHub hygiene.
- Clean module boundaries: detect / download / UI / shell. ShellBackend means OS shells, not video sites. No multi-site adapters.

## Current direction

- Start at milestone **M0 Foundation** (v0.1.0): repo scaffold, CI with artifacts, Playwright Chromium harness, CODEOWNERS/templates/security stubs, MIT LICENSE.
- Small draft PRs under ~300 lines, Conventional Commits. Max 2 parallel workers. Only Mikołaj merges; never force-push; never `limen land`.
- Build all code from scratch. No reference implementation is available to agents.
- Local e2e: Playwright 1.64.1 with Chromium 1248 already under `~/.cache/ms-playwright`; use `channel: 'chromium'` for MV3 extensions headless. ffmpeg via mise for synthetic fixtures.
