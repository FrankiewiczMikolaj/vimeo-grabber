# DASH MPD metadata

`src/detect/dash-mpd.ts` exports `parseDashMpd(xml, manifest, responseUrl?)`.
The input is XML text and an unchanged shared `ManifestReference`. The optional
response URL is the final authorised response URL; it defaults to `manifest.url`.
The caller owns fetching, redirect validation, permissions and input size limits.
This slice does not connect the parser to the existing extension runtime.

## Metadata contract

- `tracks` extend shared `Track` with parser-local `baseUrl`. `manifest` retains
  the original input object and URL, including queries; it is never replaced by
  a redirect or BaseURL. No shared model fields change.
- Standard DASH namespace prefixes/default namespaces and unqualified MPDs work.
  Foreign namespace elements/attributes do not supply track metadata; `xml:lang`
  is accepted as language. This is XML well-formedness parsing, not XSD validation.
- Period/AdaptationSet/Representation attributes inherit, with nearer values taking
  precedence. Read MIME, codec, bandwidth, dimensions, rational/decimal frame rate,
  language and channel value notation. Nonpositive/invalid numbers become `null`.
  Other absent metadata stays `null`. Language and channels are not guessed.
- Kind comes from contentType or audio/video MIME. Explicit video and audio
  ContentComponents mean combined. Unknown kind is skipped with `unsupported`
  status, preserving other parsed tracks. No codec-based muxing inference occurs.
- Representation IDs remain verbatim; missing IDs use a deterministic XML child
  index path. Group IDs are AdaptationSet IDs or `null`; IDs are not global.
- `baseUrl` resolves the first direct BaseURL at each level with WHATWG URL rules.
  Multiple BaseURLs are alternatives: only the first is represented. Relative
  paths replace inherited queries; explicit queries/escapes/repeated keys remain.
  With no BaseURL, the resolved response URL remains. It is **not** proof of a
  downloadable media URL. No SegmentTemplate/List/Timeline expansion occurs.
- Any DASH ContentProtection declaration yields `protected` and no tracks, even
  in a mixed manifest. This deliberately avoids presenting protected tracks as
  usable. Malformed XML, all DTDs (including internal/external entities), invalid
  base URLs and non-MPD roots yield `unsupported` with no tracks. Empty MPDs yield
  `unavailable`; supported representations yield `found`, not proof of playback.

## Execution and proof

Saxes 6 is a namespace-aware, DOM-free XML dependency, bundled by Vite. It has no
resource loader. DTD events are rejected before representations are returned.
The parser performs no I/O and works in an MV3 `ServiceWorkerGlobalScope`, where
`DOMParser` is absent. No offscreen document, new permissions or runtime change
is required. Future runtime integration must supply authorised metadata only.

`node --test test/dash-mpd.test.mjs` covers the owned synthetic MPD and hostile XML.
An isolated proof bundled the production parser with Vite and loaded it as an
unpacked MV3 service worker in installed Chromium 156.0.8078.4, offline. It observed
`ServiceWorkerGlobalScope`, `typeof DOMParser === 'undefined'`, four inherited
tracks, response-relative signed BaseURLs, unchanged provenance, rejected external
entities, and protected results. Fetch was trapped, zero requests were observed,
and the browser/profile were closed/removed. The proof did not use an offscreen
page or modify the product extension. No live Vimeo compatibility is claimed.
The inert proof source archive and JSON observations are retained with the job
handoff; extract at the repository root after `pnpm install --frozen-lockfile`,
then run `node artifacts/dash-mpd-proof/run.mjs` to repeat the worker scenario.
