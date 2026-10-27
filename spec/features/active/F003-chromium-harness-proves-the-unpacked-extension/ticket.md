---
opened: 2026-10-27
---

# F003 · Chromium harness proves the unpacked extension

## Outcome

Contributors can run a deterministic Chromium harness for the real unpacked extension on Linux. The existing bootstrap smoke becomes a maintainable browser proof before any video feature begins.

## Scope

- Start at scripts/smoke.mjs and retain the existing pnpm smoke and verify interfaces.
- Use Playwright 1.64.1, channel chromium, and the installed browser; provide an xvfb-backed headed execution path as well as the default headless path.
- Exercise real unpacked installation and popup behavior without Vimeo or another network dependency.
- Retain useful failure diagnostics and document how to run the harness.

## Out of scope

- CI workflow ownership, dependency upgrades, and new video functionality.
- Synthetic video fixtures, downloads, shell merge behavior, and system package installation.

## Acceptance

- pnpm verify passes locally before every push.
- The actual unpacked popup passes in both headless Chromium and a headed Chromium run under xvfb.
- The harness rejects a missing or invalid extension build with a useful diagnostic and closes its owned browser/profile after success or failure.
- Retained screenshots show the popup; report honestly whether a toolbar click or direct popup navigation was exercised.
- The draft PR targets main and has milestone M0 Foundation.
