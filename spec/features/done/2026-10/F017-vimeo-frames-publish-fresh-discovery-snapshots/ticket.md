---
opened: 2026-10-27
landed: 2026-10-27
---

# F017 · Vimeo frames publish fresh discovery snapshots

## Outcome

A reusable frame observer publishes an initial discovery snapshot and changed snapshots when Vimeo configuration appears later. It supplies the live observation seam for cross-frame M2 integration without polling or changing the current popup.

## Scope

- Start with an observer module consuming discoverPage and its existing PageDiscovery contract.
- Use the actual matching Vimeo document/window; observe relevant script/iframe changes and resource timing config candidates.
- Coalesce events, suppress unchanged snapshots, and expose deterministic observer/listener cleanup.
- Keep Chrome messaging, frame identity and tab aggregation in the later integration slice.

## Out of scope

- Non-Vimeo document observation, page-world hooks, fetch/XHR interception and generic retry loops.
- Fetching, permissions/manifest changes, popup cutover and existing parser/shared-model changes.

## Acceptance

- A real Chromium Vimeo frame emits the initial snapshot and a changed snapshot after late owned configuration appears.
- Observed config-resource candidates retain query data and duplicate events do not emit duplicate snapshots.
- Stopping observation prevents later reports and removes owned observers/listeners.
- Unsupported origins are refused without inspecting unrelated page content.
- pnpm verify passes before push; the small M2 Detection draft branches from latest main and both required checks are inspected.
