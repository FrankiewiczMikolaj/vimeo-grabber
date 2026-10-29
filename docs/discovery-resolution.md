# Discovery to quality resolution

`src/detect/resolve.ts` exports `resolveDiscovery(discovery: PageDiscovery,
frameUrl: string)`. It returns readonly `PlaybackCandidate[]`. Each candidate has
`id`, `videoId`, `title`, `source`, `manifest`, `status`, `tracks`, and optional
worker-only `invalidation` (`candidate`, `source`, or `video`).
The extension caller must first authenticate the Chrome sender and its frame URL. This module is not a
runtime entrypoint, message validator, permission prompt or tab/frame store.

Normalised inline videos are admitted directly through `MetadataTransport.inline`;
no raw config is reconstructed and no config request is required. Their source
frame must match the authenticated frame URL. A Vimeo frame can discover several
video IDs, including configs from child player frames. Config receipts still bind
the fetched video ID to the config endpoint ID. Private transport snapshots prevent
later caller mutations from authorising unrelated manifests.

Alternatives run sequentially: inline videos in discovery order, then distinct
config URLs in discovery order. Each video's manifest references keep their order.
Every protocol/CDN/URL alternative is resolved, even after another succeeds.
Identity includes video ID, source frame/config URL and the complete manifest
reference. Only an identical candidate from the same source is deduplicated.
A null manifest records a config-only unavailable outcome.
There are no retry loops, child-playlist fetches or media requests. DASH `.json`,
DASH `.mpd` and HLS `.m3u8` retain the supplied manifest references and queries.
Progressive entries become combined tracks with a canonical
`{ protocol: 'progressive', url, protected? }` reference, not a fake manifest or
initialization segment. Receipt admission creates one candidate per direct URL
without fetching media. Only `video/mp4` entries with HTTPS Vimeo CDN `.mp4`
paths qualify. Positive finite dimensions and positive safe-integer byte sizes
are retained; absent/invalid sizes stay null. Malformed siblings do not erase
usable manifest or direct-file alternatives.

Status and tracks belong to that candidate. Unknown track fields stay null.
Failed or malformed partial metadata cannot erase a usable sibling. Explicit
candidate protection invalidates its former clear alternative. Root/video protection
also emits a null-manifest `video` invalidation, including when manifests are omitted.
Transport admission refusal and HTTP 401/403 emit candidate- or source-scoped
invalidations instead of appearing as partial captures. Other HTTP/network failures
remain partial. Required browser host access does not replace source admission.
Signed URLs and candidate IDs stay in memory, not diagnostics or rendered text.
Download eligibility is separate from metadata status; the download page owns media fetching.

`mise exec -- node --test test/resolve.test.mjs test/metadata.test.mjs` compiles the
actual resolver and transport into disposable MV3 workers in offline Chromium.
Required all-sites access is active; CDP supplies owned config, DASH JSON, MPD and
HLS responses and blocks every unexpected request. Assertions
cover separate video/audio fields, original references, malformed alternatives,
multiple IDs, ordered config fallback, protection, unsupported/unavailable results,
and no media/child/key fetches. Redacted evidence is written
to `artifacts/resolver/evidence.json` and `artifacts/metadata/evidence.json`.
Profiles and generated extensions are removed. Live Vimeo and runtime UI integration
are not proven by this worker-only proof.
