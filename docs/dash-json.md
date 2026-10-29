# Vimeo adaptive DASH JSON

`src/detect/dash-json.ts` exports `parseDashJson(input, manifest, responseUrl?)`.
Pass decoded JSON, the original shared `ManifestReference`, and the authorised
manifest response URL, which defaults to `manifest.url`. The transport rejects redirects.
This pure API does not fetch media, evaluate scripts or validate permissions.
It decodes inline base64 only to validate the reference. URL validation is not fetch authorization.
The metadata transport independently checks origins, provenance and redirects.

## Supported metadata

- Root `video` and `audio` arrays produce separate tracks in source order, video first.
  Entries need a nonblank string ID or positive safe integer ID (converted to string).
  Invalid entries are skipped independently. Duplicate representation IDs are retained.
- `codecs`, `mime_type`, numeric positive `bitrate` (bits/s), video integer `width` and
  `height`, numeric positive `framerate`, audio `lang` and `channels` map to shared fields.
  Channels accept a nonblank string or positive safe integer converted to string.
  Missing/invalid fields are `null`; no MIME, group, quality or language is inferred.
- Tracks use the shared `Track.download` union. `manifest` is a copy of the input
  reference, never the response or resolved resource URL. Resolve root `base_url`
  against the response URL, stream `base_url` against that base, then each resource
  against the stream base. Missing bases inherit; invalid declared bases make
  resources unavailable, even if a later base is absolute.
- Resolution uses WHATWG URL semantics, not query merging. Empty references preserve
  the base query; path references replace it; explicit duplicate/empty/escaped query
  values remain intact. Only HTTPS without user information, fragments or backslashes
  is returned. Any host can be described; the reference does not authorize access.
- `drm`, `content_protection`, `encryption` and `encrypted` require a positive
  declaration: an active flag or nonempty scheme/method/system/key/license value.
  Known DRM-system objects are inspected for those values, not merely their existence.
  Empty objects/arrays, disabled flags and clear/none values do not mark protection.
  Root protection is inherited; protection on malformed entries still counts.
  `status` is `protected` if advertised, otherwise `found` with tracks, `unavailable`
  for recognized empty/unusable arrays, or `unsupported` for other shapes. Non-DASH
  provenance or an invalid response URL returns `unsupported` with no tracks.
  Clear siblings remain visible when the aggregate status is `protected`.
  Missing, empty or unrequested `init_segment` is never a protection signal.
  Missing init makes `download` unavailable with `missing-initialization`, not DRM.
- `init_segment` accepts canonical base64 (at most 65,536 decoded bytes, validated
  by decoding and re-encoding) or a URL-form value with an explicit scheme, path
  marker or dot/query. Base64 stays text in the serialisable contract; no byte
  buffers cross popup polling. Opaque non-base64 names are unsafe, not guessed.
  The download writer decodes base64 once and writes initialization before media.
- `segments[].url` supplies ordered media resources. No segments means unknown;
  an invalid resource makes the whole download reference unsafe. URL init remains
  distinct from inline init. No init or media request occurs here.

Unknown fields are ignored. `found` means metadata, not playable, clear, authorized
or downloadable media. Synthetic owned fixtures define compatibility; this is not
proof against a live Vimeo response.
Signed URLs must remain in memory and must not enter production diagnostics.

Run `node --test test/dash-json.test.mjs` for the owned behavioral checks.
