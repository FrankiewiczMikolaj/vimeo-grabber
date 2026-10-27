---
opened: 2026-10-27
---

# F008 · Chromium exercises the extension toolbar action

## Outcome

Contributors get evidence of the real Chromium action popup, rather than only an extension page opened in a tab. This independent harness slice establishes the strongest reliable toolbar path available before the fixture download is wired.

## Scope

- Start at the existing Playwright Chromium harness; retain pnpm smoke and verify interfaces.
- Exercise a real action popup under installed headed Chromium and xvfb if supported, with a bounded feasibility investigation.
- Keep navigation-to-popup-URL, action API invocation, keyboard activation, and physical toolbar clicking distinct in evidence.
- Capture popup screenshots and lifecycle diagnostics without adding production code solely to drive tests.

## Out of scope

- Fixture detection and stream/download UI.
- Browser upgrades, system package installation, arbitrary retry machinery, and claims of a click when only a URL was opened.

## Acceptance

- A real Chromium headed run records the actual action entry path and rendered popup; if unsupported, retain the concrete attempted APIs/errors and the narrow platform limitation.
- Existing headless smoke and pnpm verify still pass before push.
- Owned Chromium processes and temporary profiles close after success and failure.
- The draft PR targets current main with milestone M1 Walking skeleton and observes both required PR checks without claiming pending checks passed.
