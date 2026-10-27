# Vimeo adaptive DASH JSON

`src/detect/dash-json.ts` exports `parseDashJson(input, manifest, responseUrl?)`.
Pass decoded JSON, the original shared `ManifestReference`, and the final manifest
response URL after redirects. The response URL defaults to `manifest.url`.
This pure API does not fetch, evaluate scripts, read segments/initialization data,
validate permissions, or change the M1 runtime. URL validation is not fetch authorization.
The future broker must independently check origins, provenance, redirects and permissions.

## Supported metadata

- Root `video` and `audio` arrays produce separate tracks in source order, video first.
  Entries need a nonblank string ID or positive safe integer ID (converted to string).
  Invalid entries are skipped independently. Duplicate representation IDs are retained.
- `codecs`, `mime_type`, numeric positive `bitrate` (bits/s), video integer `width` and
  `height`, numeric positive `framerate`, audio `lang` and `channels` map to shared fields.
  Channels accept a nonblank string or positive safe integer converted to string.
  Missing/invalid fields are `null`; no MIME, group, quality or language is inferred.
- Each `DashJsonTrack` extends `Track` with nullable `baseUrl` and boolean `protected`.
  Its `manifest` is a copy of the input reference, never the redirect or resolved URL.
  Resolve root `base_url` against the response URL, then representation `base_url`
  against that base. Missing bases inherit; invalid declared bases yield `null`.
  An absolute valid representation URL can stand alone even if the root base is invalid.
- Resolution uses WHATWG URL semantics, not query merging. Empty references preserve
  the base query; path references replace it; explicit duplicate/empty/escaped query
  values remain intact. Only HTTPS without user information is returned. This permits
  metadata URLs on any host, but does not authorize access to them.
- Nonempty `drm` or `content_protection` declarations mark protection at root or entry
  level. Root protection is inherited. Protection on malformed entries still counts.
  `status` is `protected` if advertised, otherwise `found` with tracks, `unavailable`
  for recognized empty/unusable arrays, or `unsupported` for other shapes. Non-DASH
  provenance or an invalid response URL returns `unsupported` with no tracks.
  Clear siblings remain visible when the aggregate status is `protected`.

Unknown fields are ignored. Standard MPD, other protection vocabularies, rational
frame-rate strings, media addresses and segment parsing are not supported. `found`
means metadata, not playable, clear, authorized or downloadable media. Synthetic
owned fixtures define compatibility; this is not proof against a live Vimeo response.
Signed URLs must remain in memory and must not enter production diagnostics.

Run `node --test test/dash-json.test.mjs` for the owned behavioral checks.
