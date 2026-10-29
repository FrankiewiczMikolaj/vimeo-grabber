# Bounded metadata transport

`src/detect/metadata.ts` is a worker-safe API, not a runtime message endpoint.
It does not change production permissions or connect detected URLs to downloads.

- `config(source)` accepts an authenticated HTTP/HTTPS document and an HTTPS
  `player.vimeo.com/video/<id>/config` URL, bounded to 20 ID digits and an optional
  single alphanumeric `h` of at most 128 characters. The returned config ID must
  match the endpoint to authorise manifests. Parent references keep the real source URL.
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
  Only after admission, a DASH JSON request appends `base64_init=1` if no
  `base64_init` parameter exists. Existing query bytes, ordering, duplicates,
  empty values and explicit option values remain unchanged. HLS and MPD URLs
  are untouched. The original manifest reference remains candidate/track provenance;
  the derived request URL cannot be supplied as a new reference using the old receipt.
- `progressive(receipt, video)` returns snapshot-bound combined-file tracks, not
  bytes. Exact source, track, URL and size must match the private receipt.
  It accepts clear or positively protected progressive references on HTTPS
  `vimeocdn.com`/subdomain or exact `vod-progressive.akamaized.net` `.mp4` paths only. Protected candidates remain blocked.
  It performs no metadata/media request and does not expand manifest authorization.

Inline data and source provenance are supplied by a trusted extension caller.
A receipt is not proof of a Chrome sender's identity: do not expose these methods
as an arbitrary message-to-fetch bridge. The worker validates extension senders,
frame/document identity and discovery envelopes before admitting inline data.
Navigation-safe aggregation belongs to the runtime. Required all-sites host access
replaces per-origin permission prompts; browser capability does not authorise sources.
Requests omit credentials/referrers, disable caching and reject all redirects rather
than trusting an opaque redirect target. Each fetch/body read has an 8,000 ms deadline
and a 1,048,576-byte decoded-response limit. Non-success HTTP and wrong content types
fail. Supplied query bytes pass to fetch without rebuilding search parameters.
URLs/text live only in memory; failures contain fixed codes, not exception text or
signed queries. No segments, keys, licenses, media or Downloads API are fetched.

`mise exec -- node --test test/metadata.test.mjs` compiles this module into an owned
MV3 service worker. CDP fulfils or fails every worker request offline. The proof uses
the built required-host access model; no Chrome API is replaced. It covers
inline-without-config-HTTP, forged receipts,
invalid URLs, query bytes, redirects, HTTP/type/size/timeout/network failures and
malformed-config transport success. Redacted evidence is `artifacts/metadata/evidence.json`.
Production sender validation and live Vimeo compatibility are not proven by this isolated transport test.
