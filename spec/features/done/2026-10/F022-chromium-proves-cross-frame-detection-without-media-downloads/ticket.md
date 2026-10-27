---
opened: 2026-10-27
landed: 2026-10-27
---
# F022 · Chromium proves cross-frame detection without media downloads

## Outcome

Default Linux verification proves the assembled M2 extension through its actual Chromium action popup. The offline scenario matrix catches stale frame/tab results, broken metadata fallback and permission transitions without contacting live Vimeo or downloading media.

## Scope

- Extend the detection-only smoke that replaces M1 during popup cutover, using owned realistic configs/manifests and actual built runtime.
- Cover inline, config fallback and delayed discovery across unrelated top pages and nested Vimeo frames, including duplicate identities and malformed/protected inputs.
- Exercise tab/frame navigation/removal, delayed old responses and service-worker restart/rebuild.
- Exercise exact-origin grant, denial and revocation with real Chrome permission APIs and visible popup state.
- Retain redacted failure diagnostics/screenshots/traces and clean owned browsers, displays, profiles and fixture services.

## Out of scope

- Production feature expansion, live Vimeo as a CI dependency, media/segment/key/license fetches and synthetic download controls.
- Replaced Chrome APIs, fake runtime results or test-only production permission bypasses.

## Acceptance

- Default pnpm verify opens the real action popup and asserts exact video/audio qualities from all three manifest formats through actual runtime messages.
- Unsupported/failed discovery alternatives cannot hide valid results from another path or live frame; unrelated frame messages never enter tab state.
- Navigation, removal, tab switching and worker restart cannot display stale results, including deliberately held old metadata responses.
- Grant/deny/revoke scenarios use the real permission implementation, request only the encountered exact origin and produce the expected visible states.
- Every external request is fulfilled from owned metadata or fails the scenario; no media or Downloads API access occurs.
- A deliberate broken detection path fails with useful retained diagnostics; local verification passes before every push and both required checks pass on the M2 Detection draft.
