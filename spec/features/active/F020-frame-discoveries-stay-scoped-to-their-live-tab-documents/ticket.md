---
opened: 2026-10-27
---
# F020 · Frame discoveries stay scoped to their live tab documents

## Outcome

The extension can aggregate discovered Vimeo videos from separate frames without mixing tabs or retaining results from removed/navigated documents. Slow metadata completion cannot restore stale videos. This provides the real state and message boundary needed by the detection-only popup.

## Scope

- Implement the reusable tab/frame-document broker and validation boundary using existing discovery/model types and actual Chrome sender identity fields.
- Admit only bounded typed discovery envelopes from matching HTTPS Vimeo extension content scripts; derive tab/frame/document authority from Chrome, never payload IDs.
- Resolve admitted snapshots through an asynchronous callback and publish tab-scoped results with exact permission origins and preserved video/source provenance.
- Handle replacement, removal, top navigation and clearing/rebuilding after worker restart; define the lifecycle calls the runtime entrypoint must make.

## Out of scope

- Metadata fetching/parser dispatch, popup rendering/permission prompts, entrypoint activation and manifest/package/workflow changes.
- Arbitrary containing-site access, media downloads, polling and live Vimeo proof.

## Acceptance

- Two tab/frame documents remain isolated; forged sender/envelope identity and unsupported origins cannot enter state or invoke resolution.
- Replacement, removal and navigation discard old results; a deliberately held old resolution cannot overwrite a newer or cleared document.
- Duplicate video discoveries do not mix unrelated video identities or lose the selected live frame's provenance.
- Fresh publications rebuild an empty broker without persistent URLs or signed-query diagnostics.
- Consumer-visible lifecycle and error transitions are exercised; callback tests must prove state behavior, not merely echo forwarded values.
- Local pnpm verify passes before every push; a small M2 Detection draft and both required checks are inspected.
