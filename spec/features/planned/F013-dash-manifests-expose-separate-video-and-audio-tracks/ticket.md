---
opened: 2026-10-27
---

# F013 · DASH manifests expose separate video and audio tracks

## Outcome

Owned Vimeo adaptive DASH JSON manifests expose separate video and audio representations through the shared M2 track model. This is metadata parsing only; standard MPD parsing is a separate small slice.

## Scope

- Start from the merged shared model and a pure Vimeo adaptive JSON parser.
- Retain representation identity, codecs, bitrate, resolution/frame rate and audio language/channels when present.
- Resolve declared relative references against the manifest response URL while preserving URL semantics and explicit query data.
- Author owned multi-quality/audio fixtures; declare protected or unsupported data without fetching media.

## Out of scope

- Standard DASH MPD, HLS, network broker and popup integration.
- Segments, initialization bytes, keys/licenses and real downloads.

## Acceptance

- An owned adaptive JSON manifest returns the exact expected video/audio representation metadata.
- Missing fields remain unknown; malformed entries cannot invent tracks or hide usable siblings.
- Relative-reference and signed-query behavior is proved by deterministic consumer-visible checks.
- The actual parser executes in installed Chromium offline and local pnpm verify passes before push.
- The small draft targets latest main with M2 Detection and both required checks are inspected.
