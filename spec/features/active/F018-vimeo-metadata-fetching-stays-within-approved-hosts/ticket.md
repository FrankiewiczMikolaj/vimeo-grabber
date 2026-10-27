---
opened: 2026-10-27
---

# F018 · Vimeo metadata fetching stays within approved hosts

## Outcome

An extension-context metadata loader can fetch permitted player configs and manifest text without becoming an arbitrary URL proxy. Missing permissions and invalid sources produce explicit results while metadata-only requests remain bounded and private.

## Scope

- Start with a worker-safe fetch module consuming existing DetectionSource, NormalisedVideo and ManifestReference values.
- Allow recognised HTTPS player.vimeo.com config endpoints and provenance-linked manifest references within the approved vimeocdn.com family, checking actual exact-origin permissions before requests.
- Use finite request/body limits, preserve supplied query bytes, reject unvalidated redirects, and keep signed URLs out of diagnostics/storage.
- Return complete config/manifest metadata transport results for later parsing/aggregation; do not register runtime message handlers or change production permissions here.

## Out of scope

- Arbitrary URLs, origin expansion, credential/cookie collection or forwarding, segments, keys, licenses and media downloads.
- Page observation, popup permission prompts, parser/shared-model rewrites and runtime/manifest cutover.

## Acceptance

- The compiled loader executes in a real Chromium service worker with owned fulfilled config/manifest responses and no live Vimeo access.
- Unpermitted origins, forged/unrelated references, non-HTTPS/credentialed URLs and bad endpoints issue no request and return explicit failure/permission results.
- Unverifiable redirects are not followed; oversized, timed-out, non-success HTTP or unexpected-content-type responses cannot be reported as successfully fetched metadata.
- Valid query data survives and network/error diagnostics contain no raw signed query values.
- No media/segment/key or Downloads API request occurs; actual Chrome permission checks are not replaced by a fake success implementation.
- Local pnpm verify passes before push; the small M2 draft targets latest main and both required checks are inspected.
