---
opened: 2026-10-27
---
# F019 · Discovered Vimeo configs resolve to track qualities

## Outcome

An authenticated frame discovery can be resolved into real video/audio quality metadata through the existing bounded transport and DASH/HLS parsers. Inline configs remain useful without a config HTTP request; a failed alternative does not hide a usable fallback.

## Scope

- Add a worker-safe discovery resolver using the existing discovery/model, transport and three parser contracts.
- Admit the normalised inline videos that discovery actually publishes; make the smallest clean transport API correction rather than reconstructing fictitious raw configs or adding a parallel receipt convention.
- Preserve identities, source/manifest provenance, signed query bytes and unknown metadata through finite ordered alternatives.
- Return resolved videos and exact encountered permission origins, with explicit unavailable, permission-needed, protected or unsupported outcomes where applicable.

## Out of scope

- Chrome sender validation, tab/frame state, runtime activation, popup prompts and manifest permissions.
- Media/segment/key downloads, live Vimeo access, parser rewrites and broad network grants.

## Acceptance

- Owned inline discovery resolves exact separate video/audio metadata without a config HTTP request.
- Malformed or unusable earlier alternatives can reach a later config/manifest without erasing another valid video.
- DASH JSON, MPD and HLS dispatch retain original manifest provenance and report protection/unsupported input honestly.
- Missing grants return only encountered exact origins; no media requests or signed-query diagnostics occur.
- The compiled resolver runs in real offline Chromium with the actual permission/transport implementation.
- Local pnpm verify passes before every push; the small draft targets main, has M2 Detection milestone and both required checks inspected.
