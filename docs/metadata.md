# Bounded metadata transport

`src/detect/metadata.ts` is a worker-safe API, not a runtime message endpoint.
It does not change production permissions or connect detected URLs to downloads.

- `config(source)` accepts an authenticated HTTPS Vimeo frame and an HTTPS
  `player.vimeo.com/video/<id>/config` URL. The returned config must have that ID
  to authorise manifests. The frame may discover a different video through an iframe.
  A successful result contains fetched text, not a claim that quality extraction succeeded.
- `inline(video)` admits the normalised video published by discovery, not raw config
  data. Its source must be an HTTPS Vimeo frame with null config URL and a numeric
  video ID. It returns `{ video }` as a worker-local provenance receipt with a
  private snapshot. It makes no request and needs no player-config host grant.
- `manifest(receipt, video, reference)` accepts either the original fetched config
  result or an inline receipt from the same transport instance. The exact video
  identity/source and reference protocol/CDN/URL must match the receipt snapshot.
  Cloned receipts, unrelated references and later caller mutations cannot expand it.
  Only HTTPS `vimeocdn.com` or its subdomains, without a non-default port, qualify.
  DASH `.json`/`.mpd` and HLS `.m3u8` endpoints have explicit content-type allowlists.

Inline data and source provenance are supplied by a trusted extension caller.
A receipt is not proof of a Chrome sender's identity: do not expose these methods
as an arbitrary message-to-fetch bridge. Later runtime integration must validate
extension senders, frame/document identity and discovery envelopes before admitting
inline data. Permission prompts and navigation-safe aggregation also belong there.

Every request uses the real `chrome.permissions.contains` for the exact origin.
Missing access returns `permission-needed` with that origin; API failure is explicit.
Requests omit credentials/referrers, disable caching and reject all redirects rather
than trusting an opaque redirect target. Each fetch/body read has an 8,000 ms deadline
and a 1,048,576-byte decoded-response limit. Non-success HTTP and wrong content types
fail. Supplied query bytes pass to fetch without rebuilding search parameters.
URLs/text live only in memory; failures contain fixed codes, not exception text or
signed queries. No segments, keys, licenses, media or Downloads API are fetched.

`mise exec -- node --test test/metadata.test.mjs` compiles this module into an owned
MV3 service worker. CDP fulfils or fails every worker request offline. The proof uses
actual Chromium permissions, including absent optional CDN and absent config grants;
no permission API is replaced. It covers inline-without-config-HTTP, forged receipts,
invalid URLs, query bytes, redirects, HTTP/type/size/timeout/network failures and
malformed-config transport success. Redacted evidence is `artifacts/metadata/evidence.json`.
Production sender validation, popup prompts and live Vimeo compatibility are not proven.
