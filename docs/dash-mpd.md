# DASH MPD metadata

`src/detect/dash-mpd.ts` exports `parseDashMpd(xml, manifest, responseUrl?)`.
The input is XML text and an unchanged shared `ManifestReference`. The optional
response URL is the final authorised response URL; it defaults to `manifest.url`.
The caller owns fetching, redirect validation, permissions and input size limits.
The resolver supplies the fetched response URL. No resource request occurs here.

## Metadata contract

- Tracks use shared `Track.download`; no parser-local base locator is exposed.
  `manifest` retains the original input object and URL, including queries.
- Standard DASH namespace prefixes/default namespaces and unqualified MPDs work.
  Foreign namespace elements/attributes do not supply track metadata; `xml:lang`
  is accepted as language. This is XML well-formedness parsing, not XSD validation.
- Period/AdaptationSet/Representation attributes inherit, with nearer values taking
  precedence. Read MIME, codec, bandwidth, dimensions, rational/decimal frame rate,
  language and channel value notation. Nonpositive/invalid numbers become `null`.
  Other absent metadata stays `null`. Language and channels are not guessed.
- Kind comes from explicit contentType or audio/video MIME, then an unambiguous
  ContentComponent kind, then inherited metadata. A single agreed component
  language supplies a default; nearer explicit attributes remain authoritative.
  Conflicting component languages do not choose a language. Explicit video and
  audio ContentComponents remain combined. Unknown kind is skipped with
  `unsupported` status, preserving other tracks; no codec-based inference occurs.
- Representation IDs remain verbatim; missing IDs use a deterministic XML child
  index path. Group IDs are AdaptationSet IDs or `null`; IDs are not global.
- The first direct BaseURL at each level resolves with WHATWG URL rules. Relative
  paths replace inherited queries; explicit queries/escapes/repeated keys remain.
  BaseURL alone is never treated as a completed file, even with a file extension.
- Supported addressing is a complete `SegmentList`, inherited as a whole or
  replaced at a nearer level. One explicit `Initialization@sourceURL` precedes
  `SegmentURL@media` resources in declared order, resolved against the representation
  base. Missing initialization, missing resources and unsafe URLs remain unavailable.
  SegmentBase, SegmentTemplate, byte ranges and partial SegmentList inheritance are
  unsupported. No template or timeline expansion occurs. URL validation grants no
  permission; every origin and redirect must be authorised again at future use.
- Any DASH ContentProtection declaration yields `protected` and no tracks, even
  in a mixed manifest. This deliberately avoids presenting protected tracks as
  usable. Malformed XML, all DTDs (including internal/external entities), invalid
  base URLs and non-MPD roots yield `unsupported` with no tracks. Empty MPDs yield
  `unavailable`; supported representations yield `found`, not proof of playback.

## Execution and proof

Saxes 6 is a namespace-aware, DOM-free XML dependency, bundled by Vite. It has no
resource loader. DTD events are rejected before representations are returned.
The parser performs no I/O and works in an MV3 `ServiceWorkerGlobalScope`, where
`DOMParser` is absent. No offscreen document or new permissions are required.

`node --test test/dash-mpd.test.mjs` covers exact owned resources and hostile XML.
The compiled extension harness (`pnpm smoke`) checks exact ordered references,
signed queries and candidate/Track provenance through popup-state serialization,
with all requests intercepted and zero media/init/key/license requests.
This does not prove live Vimeo compatibility.
