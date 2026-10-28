# Discovery to quality resolution

`src/detect/resolve.ts` exports `resolveDiscovery(discovery: PageDiscovery,
frameUrl: string)`. It returns readonly `PlaybackCandidate[]`. Each candidate has
`id`, `videoId`, `title`, `source`, `manifest`, `status`, `tracks`, and `permissionOrigins`.
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
A null manifest records a config-only unavailable or permission-needed outcome.
There are no retry loops, child-playlist fetches or media requests. DASH `.json`,
DASH `.mpd` and HLS `.m3u8` retain the supplied manifest references and queries.

Status, tracks and missing origins belong to that candidate, with no video-level
status precedence or first-success projection. Unknown track fields stay null.
Failed, malformed or protected candidates cannot erase a usable sibling. Chrome
grants apply only to the same exact origin; this function never requests one.
Signed URLs and candidate IDs stay in memory, not diagnostics or rendered text.
Download eligibility is separate from metadata status; the download page owns media fetching.

`mise exec -- node --test test/resolve.test.mjs test/metadata.test.mjs` compiles the
actual resolver and transport into disposable MV3 workers in offline Chromium.
Real `chrome.permissions.contains` checks remain active; CDP supplies owned config,
DASH JSON, MPD and HLS responses and blocks every unexpected request. Assertions
cover separate video/audio fields, original references, malformed alternatives,
multiple IDs, ordered config fallback, protection, unsupported/unavailable results,
exact missing origins and no media/child/key fetches. Redacted evidence is written
to `artifacts/resolver/evidence.json` and `artifacts/metadata/evidence.json`.
Profiles and generated extensions are removed. Live Vimeo and runtime UI integration
are not proven by this worker-only proof.
