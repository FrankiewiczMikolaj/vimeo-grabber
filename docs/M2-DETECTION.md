# M2 Detection · v0.3.0

Historical M2 plan for v0.3.0, retained as design and evidence context. Current
download capabilities and limits are in [M3 Download](M3-DOWNLOAD.md) and README.

## Outcome and boundary

List real Vimeo videos with available qualities and separate audio tracks, including
Vimeo iframes on unrelated sites. Fetch page/config/manifest metadata only: never
segments, initialization media, keys, licenses, or real media files. Downloads are M3.
This plan precedes implementation; its small draft is reviewed by Mikołaj first.

## Discovery and fallback

1. Inspect Vimeo-page and player-frame script text for recognised config envelopes:
   inline player JSON, JSON assignments such as playerConfig, and page-config
   wrappers carrying a player config_url. Parse data; never eval page scripts.
2. If inline data is absent, malformed, or lacks usable manifest references, inspect
   the matching player frame and use a discovered config_url. A recognised Vimeo
   video/embed URL can supply the player config endpoint as the final fallback.
   Preserve the unlisted h parameter and relevant supplied query data; do not
   synthesise credentials or strip signed URL parameters.
3. Observe later script/iframe insertion and resource timing entries for recognised
   config URLs, then rerun discovery for changed candidates. This is not a fetch/XHR
   monkey patch or a response-body sniffer. A discovered later config can be fetched
   by the extension. Deduplicate candidates; keep fallback finite, not a retry loop.

Use explicit per-video pending, found, unavailable, permission-needed/denied, and
protected/unsupported results. A failed path must not erase a valid alternative.
Vimeo config shapes are not a stable public API: fixtures define the supported
shapes, and manual real-page evidence must validate compatibility before M2 closes.
A private, expired, denied, or DRM-protected response is not permission to bypass it.

## Runtime and permissions

- Keep static ISOLATED content scripts limited to HTTPS vimeo.com, www.vimeo.com,
  and player.vimeo.com. Set all_frames so a matching player iframe is inspected
  even when its top page is unrelated. Do not inject into unrelated frames or
  request access to their containing site; no about:blank/blob fallback initially.
- A small extension service worker owns config/manifest fetches and tab/frame
  aggregation. Content scripts cannot bypass page CORS. Accept only typed detection
  requests from matching extension content scripts, not arbitrary fetch URLs.
- Require only https://player.vimeo.com/* for cross-origin player-config fallback.
  Declare https://*.vimeocdn.com/* as optional metadata access, requesting only an
  encountered exact CDN origin after an explicit popup button click. Explain its
  purpose; denial leaves the video visible with unavailable qualities. This CDN
  family is a compatibility boundary, not proof every Vimeo CDN uses it: another
  host requires evidence and a reviewed permission change, never an all-URLs grant.
- Validate HTTPS origins, config/manifest provenance and each redirect before
  fetching; a content-script message is untrusted input. Preserve signed URLs in
  memory, redact their queries from diagnostics, and do not persist them.
- No activeTab, scripting, tabs, webRequest, debugger, cookies, storage or arbitrary
  site permission is planned. Clear stale tab/frame documents on navigation and
  rebuild results after service-worker restart; scope popup results to its tab.
- At the detection-only popup cutover, remove the M1 dummy download button/module
  and downloads permission. Do not connect detected manifest URLs to Downloads API.

## Manifest and popup contract

Normalise videos by identity and source frame; merge duplicate discoveries without
merging unrelated videos. Keep title, source, detection status and manifest provenance.
Tracks retain kind (video/audio/combined), protocol, stable representation/group ID,
codec/MIME, bandwidth, resolution/frame rate when present, and language/channels
when supplied. Unknown values stay unknown; no progressive-video URL substitutes
for adaptive manifest parsing. The popup renders text, not HTML, and shows qualities
per video with audio groups/languages and partial/denied results.

Support Vimeo adaptive DASH JSON video/audio arrays and standard DASH MPD
AdaptationSet/Representation metadata with inherited attributes and BaseURL.
For HLS, parse master variants and EXT-X-MEDIA audio groups with quoted attributes
and relative URIs. Mark combined/muxed variants honestly; absent audio URI does not
invent a separate downloadable track. Fetch child playlists only if track metadata
requires them; never retrieve their media or encryption keys. Detect advertised
protection and report it, rather than promising downloadable streams.

Resolve relative references against the authorised manifest response URL, preserving
URL semantics and explicit query data. A broken DASH source may fall back to HLS,
and vice versa, without fabricated metadata or unlimited alternate fetches.

## Small draft sequence

Each implementation slice gets its own numbered ticket after this plan merges.
Every branch starts at latest main; Mikołaj merges; max two workers; milestone 3.

1. Shared video/track/status contract, config normalisation, and owned fixture corpus.
2. DASH adaptive JSON and MPD metadata parsing, split further if needed for ~300 lines.
3. HLS variant/audio parsing; independent of DASH after the shared contract merges.
4. Multi-path page/player/delayed discovery and matching-frame reporting.
5. Validated fetch broker, optional CDN grant, fallback and navigation-safe aggregation.
6. Popup video/quality/audio listing and clean removal of synthetic download plumbing.
7. Persistent offline Chromium e2e, replacing the superseded M1-only native-save proof.

Pure parsers and discovery can overlap only on disjoint files with an agreed model.
No stubs, duplicate detector convention, catch-all host grant, or silent feature cut.
Both Verify extension and CodeQL run on every PR, including this planning draft.

## Proof and data handling

Author fixtures from scratch with realistic envelopes, dummy IDs/query values,
multiple qualities and languages, and no live URLs containing tokens or user data.
Cover inline success; failed-inline fallback; player-only and delayed config;
non-Vimeo top page with cross-origin/nested Vimeo frames; duplicate and navigated
frames; DASH JSON/MPD; HLS video/audio groups; malformed/denied/protected metadata;
and grant, denial and revocation of the precise optional CDN origin.

The real Chromium action popup stays the integration surface. A fixture server or
interceptor fulfils every allowed metadata request; all other requests fail the
scenario. Assert no media/segment/key request and no Downloads API call. Retain
redacted traces and screenshots, close browsers/profiles, and run pnpm verify before
push. Unit fixtures are not evidence of successful extraction from live Vimeo.
Before closing M2, separately inspect an authorised real Vimeo page and an embedded
player, without media downloading; report any unreachable live prerequisite plainly.

## Sources and limits

- [Chrome content-script frame matching](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts): each frame is matched independently.
- [Chrome extension network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): extension fetch permissions and untrusted-message boundaries.
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions): exact-origin requests need a user gesture.
- [Vimeo Player SDK](https://github.com/vimeo/player.js): player iframe identity and unlisted h handling; not a manifest-extraction API.
- [HLS RFC 8216](https://www.rfc-editor.org/rfc/rfc8216), sections 4.3.4.1–2: variants and alternative audio.
- [DASH-IF guidance](https://dashif.org/docs/DASH-IF-IOP-v4.3.pdf): MPD representation and adaptation-set structure.

No live Vimeo config has been validated by this planning change. Supported config
shapes and the CDN host boundary must be checked against permitted real examples,
not inferred from the synthetic M1 detector or presented as official Vimeo guarantees.
