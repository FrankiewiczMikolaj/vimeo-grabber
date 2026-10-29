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
  in object order; DASH precedes HLS. DASH `avc_url` (H.264) precedes generic `url`.
  Identical URLs within one protocol/CDN appear once; other alternatives remain.
- URLs are returned verbatim, including escapes, repeated queries and empty values.
  Validation does not authorise an origin or prove a playable response. The
  metadata transport validates provenance, allowed origins and redirects.
- `source` is a shallow copy of caller-supplied provenance. No identity or URL is
  derived from it. Signed config URLs must remain in memory, not diagnostics.
- `status` is `protected` for positive root/video DRM or encryption declarations;
  otherwise `found` when manifest references exist, or `unavailable`.
  Empty/disabled DRM containers do not imply protection. `found` does not mean
  parsed tracks or successful access. No denial, codec, resolution or audio is inferred.
  Candidate-local descriptor/CDN protection is recorded as `ManifestReference.protected`.
  Positive `request.drm.hls` also applies to HLS candidates. Other `request.drm`
  declarations apply only where that candidate's exact URL also occurs under
  `files.hls_cenc.cdns`. Unrelated DRM capabilities or encrypted alternatives do not
  suppress clear HLS. Protected references are resolved without fetching a manifest.
- `tracks` is empty until a manifest parser supplies metadata. Inputs are not mutated.

## Shared types (`src/detect/model.ts`)

`Protocol` is `dash | hls`. `DetectionSource` contains `frameUrl` and nullable
`configUrl`. `ManifestReference` contains `protocol`, CDN key `cdn`, `url`, and
optional `protected: true` for positively candidate-scoped config declarations.
`NormalisedVideo` contains `id`, nullable `title`, `source`, `status`, `manifests`,
and `tracks`. All fields and returned array types are readonly (not runtime frozen).
`DetectionStatus` is `pending | found | unavailable | protected | unsupported`;
later stages own transitions beyond normalisation.

`Track` requires representation `id`, nullable `groupId`, explicit `kind`
(`video | audio | combined`), originating `manifest`, explicit `download` reference, and nullable `codec`,
`mimeType`, `bandwidth` (bits/s), `width`/`height` (pixels), `frameRate` (frames/s),
`language`, and `channels` (source notation). Unknown metadata is `null`, never a
quality inferred from a URL. IDs are scoped to their manifest/group, not global.

`test/fixtures/player-configs.json` is authored from scratch with dummy identities
and signatures. It covers two adaptive configs and one progressive-only config.
These supported shapes are not live Vimeo compatibility evidence.
Run `node --test test/normalise.test.mjs` for behavioral regressions.
