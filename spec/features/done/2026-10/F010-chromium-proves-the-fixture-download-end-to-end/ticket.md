---
opened: 2026-10-27
landed: 2026-10-27
---

# F010 · Chromium proves the fixture download end to end

## Outcome

A deterministic Linux Chromium scenario loads the synthetic Vimeo page, opens the extension, lists its stream, and saves the dummy download. This proves the assembled M1 walking skeleton, including the strongest toolbar action path the installed Chromium can support.

## Scope

- Start from merged detection and popup/download changes in the real Chromium harness.
- Serve or intercept only owned synthetic fixture content under a Vimeo origin without contacting live Vimeo.
- Exercise the real extension action path established by the toolbar slice when feasible; document any unsupported toolbar limitation and keep direct-URL proof distinct.
- Keep the scenario in the default verification path and retain useful screenshots, download evidence, and failure diagnostics.

## Out of scope

- Live Vimeo network access, real content rights handling, adaptive formats, and shell merge features.
- Test-only production bypasses, mocked Downloads API success, dependency PRs, and release automation.

## Acceptance

- pnpm verify runs the real fixture-to-download scenario and passes on Linux with the installed Chromium.
- The saved file has the fixture filename and exact expected bytes; the observed browser download completes.
- Rendered popup evidence shows the detected stream and records the actual extension entry path.
- A negative unsupported-page path cannot list or download the synthetic stream.
- CI Verify extension and CodeQL both complete successfully on the M1 draft PR before it is reported ready; pending or inaccessible checks are reported honestly.
