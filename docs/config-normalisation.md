# Player config normalisation

`src/detect/normalise.ts` exports
`normalisePlayerConfig(config: unknown, source: DetectionSource): NormalisedVideo | null`.
It consumes an already decoded player config, not a script, JSON string, or page wrapper.
It performs no network access, DOM discovery, manifest parsing, or permission decisions.
The frame observer and worker resolver use this shared model for detection.

## Supported input and result

- `video.id`: positive safe integer or nonzero decimal digit string; output is a string.
  Missing or invalid identity returns `null`, even if manifest URLs exist.
- `video.title`: nonblank string, preserved verbatim; otherwise `null`.
- `request.files.dash.cdns[name].url` and `.avc_url`, and
  `request.files.hls.cdns[name].url`: absolute HTTPS URLs without credentials.
  Invalid entries are skipped individually. No progressive fallback is used.
- Each protocol's valid `default_cdn` key comes first, followed by other CDN keys
  in object order; DASH precedes HLS. DASH `url` precedes `avc_url`.
  Identical URLs within one protocol/CDN appear once; other alternatives remain.
- URLs are returned verbatim, including escapes, repeated queries and empty values.
  Validation does not authorise an origin or prove a playable response. The future
  fetch broker must validate provenance, allowed origins, permissions and redirects.
- `source` is a shallow copy of caller-supplied provenance. No identity or URL is
  derived from it. Signed config URLs must remain in memory, not diagnostics.
- `status` is `found` when usable manifest references exist, otherwise `unavailable`.
  `found` does not mean parsed tracks, successful access, or absence of protection.
  Config normalisation does not infer denial, DRM, codecs, resolution or audio.
- `tracks` is empty until a manifest parser supplies metadata. Inputs are not mutated.

## Shared types (`src/detect/model.ts`)

`Protocol` is `dash | hls`. `DetectionSource` contains `frameUrl` and nullable
`configUrl`. `ManifestReference` contains `protocol`, CDN key `cdn`, and `url`.
`NormalisedVideo` contains `id`, nullable `title`, `source`, `status`, `manifests`,
and `tracks`. All fields and returned array types are readonly (not runtime frozen).
`DetectionStatus` is `pending | found | unavailable | permission-needed | denied |
protected | unsupported`; later stages own transitions beyond normalisation.

`Track` requires representation `id`, nullable `groupId`, explicit `kind`
(`video | audio | combined`), originating `manifest`, and nullable `codec`,
`mimeType`, `bandwidth` (bits/s), `width`/`height` (pixels), `frameRate` (frames/s),
`language`, and `channels` (source notation). Unknown metadata is `null`, never a
quality inferred from a URL. IDs are scoped to their manifest/group, not global.

`test/fixtures/player-configs.json` is authored from scratch with dummy identities
and signatures. It covers two adaptive configs and one progressive-only config.
These supported shapes are not live Vimeo compatibility evidence.
Run `node --test test/normalise.test.mjs` for behavioral regressions.
