---
opened: 2026-10-27
---

# F015 · DASH MPD representations retain inherited track metadata

## Outcome

Standard DASH MPD metadata yields separate video/audio representations in the shared M2 model. Inherited attributes and BaseURL resolution preserve the qualities and audio identities declared by the manifest.

## Scope

- Start from the merged model and an XML parsing seam usable in the selected extension runtime.
- Read AdaptationSet/Representation identity and inherited MIME, codec, bitrate, dimensions/frame rate and audio language/channels.
- Resolve nested BaseURL references against the authorised response URL without fetching segments or expanding media timelines.
- Reject malformed/external-entity input and represent advertised content protection without decrypting it.

## Out of scope

- Adaptive DASH JSON, HLS, fetching permissions, popup UI and offscreen/test-only production scaffolds.
- Segments, initialization media, keys/licenses and download implementation.

## Acceptance

- Owned MPDs return correct separate representations with inherited metadata and nested relative BaseURL handling.
- Unknown attributes remain unknown and protected/malformed manifests cannot be reported as unprotected usable tracks.
- The parser runs in the actual browser runtime without external entity/network access.
- Local pnpm verify passes before push; a small draft targets latest main with M2 Detection.
- Both required PR checks are inspected before ready notification.
