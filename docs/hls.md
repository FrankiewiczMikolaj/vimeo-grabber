# Pure HLS metadata parser

`parseHls(text, manifest, responseUrl = manifest.url)` in `src/detect/hls.ts`
consumes a decoded master playlist and shared `ManifestReference`. It performs no
fetch, key access, segment access or permission decision.
Run `node --test test/hls.test.mjs` for owned fixtures.

The result contains shared `DetectionStatus`, `tracks` and `audioGroups`.
Each track implements shared `Track` with `download: { kind: 'playlist', url }`
and parser-local `attributes` (all supplied attributes, including unknown keys). `manifest` is
the original input reference, unchanged even when a redirect response URL is used.
The caller supplies the authorised final response URL and must validate every
future request independently. URI validation here is not network authorisation.
Only HTTPS playlist URLs without credentials are supported. Standard URL resolution
preserves explicit queries; a relative path does not inherit the master's query.
This is media-playlist indirection, never a completed media file or a grant.
Protected or unsupported forms carry unavailable references instead.

Variant IDs are zero-based `variant:N` in source order. Audio IDs are `audio:N`
in audio rendition order, scoped to this manifest. Variant `groupId` links to
`audioGroups[].groupId`. Each rendition retains name, language, source channels
notation, attributes and nullable resolved URI. Only renditions with URIs create
separate audio tracks. No audio codec or bandwidth is guessed from a variant's
aggregate values. MIME and absent optional metadata remain null.

Recognised audio-only codec lists yield audio variants. Recognised video-only lists
without an audio group yield video variants. An entirely external audio group yields
video variants; an in-band or mixed group yields combined variants. Other variants
are conservatively combined (potentially muxed), not proof of separate video or audio.
Unknown codecs remain verbatim. Width/height, frame rate and bandwidth use supplied
positive finite values; malformed optional numeric metadata remains null.

Malformed headers, attributes, required bandwidth, missing URIs/groups, duplicate
rendition identities and invalid playlist URLs yield unavailable with empty results.
Unknown tags are ignored. Media playlists, I-frame variants and variable definitions
are unsupported; this parser does not expand variables or fetch children.
`hlsProtection` is shared by detection and download-time media-playlist assembly.
Any `/drm/` path segment in the master, response, video variant or audio rendition
URL marks the candidate protected. Subtitle renditions, `.vtt` locators and variants
whose declared codecs are only `wvtt`/`stpp` do not supply protection evidence.
All video/audio locators are inspected, not the first `EXT-X-MEDIA` entry.
KEY/SESSION-KEY `SAMPLE-AES` and `SAMPLE-AES-CTR`,
FairPlay, Widevine and PlayReady KEYFORMAT declarations also mark it protected.
Protected candidates offer no download buttons and use the same wording as DASH.
AES-128 alone is unsupported encryption, not DRM; NONE alone is clear.
A master cannot prove children clear. Child-only DRM is refused in the download
tab as “Protected (DRM), cannot download” before initialization or media access.
No keys or licenses are fetched. Owned fixtures are not live compatibility proof.
