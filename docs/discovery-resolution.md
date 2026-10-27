# Discovery to quality resolution

`src/detect/resolve.ts` exports `resolveDiscovery(discovery: PageDiscovery,
frameUrl: string)`. It returns a promise of readonly `{ video: NormalisedVideo,
permissionOrigins: readonly string[] }` results. The extension caller must
first authenticate the Chrome sender and its frame URL. This module is not a
runtime entrypoint, message validator, permission prompt or tab/frame store.

Normalised inline videos are admitted directly through `MetadataTransport.inline`;
no raw config is reconstructed and no config request is required. Their source
frame must match the authenticated frame URL. A Vimeo frame can discover several
video IDs, including configs from child player frames. Config receipts still bind
the fetched video ID to the config endpoint ID. Private transport snapshots prevent
later caller mutations from authorising unrelated manifests.

Alternatives run sequentially: inline videos in discovery order, then distinct
config URLs in discovery order. Each video's manifest references keep their order.
An exact reference is attempted at most once per video; a found video stops further
alternatives for that ID without skipping other videos. There are no retry loops,
child-playlist fetches or media requests. DASH `.json`, DASH `.mpd` and HLS `.m3u8`
use the existing parsers and retain the supplied manifest references and queries.

Failed paths do not erase stronger results. Status precedence is found, protected,
permission-needed, unsupported, denied, unavailable, pending. Unknown track fields
stay null. Missing grants accumulate only encountered exact origins per video,
including when a later alternative succeeds. A caller may rerun after a grant;
this function never requests one. Signed URLs stay in memory, not diagnostics.

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
