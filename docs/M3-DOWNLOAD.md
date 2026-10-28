# M3 Download

## Outcome and boundary

Save selected Vimeo video and audio as two correct files, then show a safe Linux
ffmpeg merge command. Vimeo-only, English, no extension-side mux, authentication
bypass, key/license retrieval or browser-store publication. CI uses owned fixtures;
Bob performs the requested live checks in his browser.

## Ordered small drafts

1. **Independent candidates (#41).** Keep every DASH/HLS protocol/CDN/manifest
   alternative and its source provenance. Resolve candidates independently across
   config paths and live frames, not until the first video-level success. Keep
   permission, denied, protected and failure state per candidate; exact-origin
   grants are shared only where the origin actually matches. A working HLS result
   must leave the second DASH origin request visible. Prefer DASH with separate
   video/audio, without hiding HLS or mixing tracks from different candidates.
2. **Download references (#42).** Extend Track with explicit manifest/playlist,
   inline-or-URL init and ordered media references, bound to its candidate. A
   manifest URL is not a completed media-file URL. For DASH JSON resolve the
   manifest base against its response URL, the stream base against that result,
   and segment references against the stream base. Preserve normal query semantics;
   never blindly copy a parent query onto child URLs. Decode inline init bytes;
   never interpret them as a URL. Migrate all callers without compatibility shims.
3. **Separate files (#45).** User selection starts only the chosen authorised
   tracks. Write each inline/init segment first, then its media segments in order;
   never interleave video with audio. A dedicated extension download page owns
   bounded streaming to temporary disk-backed files and native download completion,
   so popup closure or worker sleep does not own the byte buffers. Clean temporary
   data on completion/error and recover orphan cleanup on the next run. Report
   unsupported/protected forms and quota/network/permission failures honestly.
4. **Linux command (#43).** Use actual completed-download absolute paths and
   POSIX-safe quoting for bash/zsh. Include `ffmpeg -version`, the apt install hint
   and merge instructions. Keep original files; no hidden transcoding or OS tabs.
5. **One-time notice (#44).** Show the English rights/own-risk/liability notice on
   first use after install. Retain only acknowledgement state across updates;
   preserve the footer and show the notice for a fresh install/profile.

## Track reference contract (#42)

`Track.manifest` binds the track to its candidate's original protocol/CDN/URL;
the enclosing candidate owns frame/config provenance. `Track.download` is a
serialisable discriminated union: `playlist` with its own media-playlist `url`,
`resources` with ordered `resources`, or `unavailable` with a reason (`protected`,
`missing-initialization`, `unknown`, `unsafe`, `unsupported`). A resource is
`{ role: 'initialization', kind: 'inline-base64', data }` or
`{ role: 'initialization' | 'media', kind: 'url', url }`. Initialization is first,
then media in declared order. Inline data stays bounded base64 text, not a byte
buffer copied through popup polling. No locator is a permission grant.

HLS variants and separate audio retain independent playlist URLs and audio group
identity. DASH JSON stacks response/manifest/stream/resource bases with standard
query replacement. MPD supports explicit complete SegmentList resources; a base
directory, SegmentBase, template, byte range or partial inherited list is not
guessed into a file. Detection `found` still means metadata, not download eligibility.

HLS detection and assembly share the protection rules in `docs/hls.md`.
DRM master/selected video/audio paths, DRM KEY/SESSION-KEY declarations and
positively candidate-scoped config DRM suppress download buttons. Unrelated
`request.drm` capabilities and `files.hls_cenc` alternatives do not suppress clear
HLS. Child playlists remain download-time metadata; child-only DRM displays
“Protected (DRM), cannot download” without key/license/media requests.

## Permissions and proof

Keep the current Vimeo frame boundary and exact encountered CDN grants. Add only
permissions needed by a slice, explaining each change; no arbitrary URL-to-fetch
messages, credentials, persisted signed URLs or wildcard permission requests.
Download references are revalidated at use, including redirects and extra origins.

Use tiny owned fragmented-media fixtures: exact base resolution, init-before-media
bytes and segment ordering, then real Chromium separate-file completion and media
inspection. Cover HLS-first/second-origin DASH, deny/revoke, candidate identity,
malformed data and popup closure. Run the safe ffmpeg command on synthetic files.
Retire weaker tests rather than duplicating paths. Live Vimeo never gates CI.

Request Bob's live check after #41 (second grant and separate DASH preference) and
#45 (two usable files), reporting exact limits rather than claiming fixture proof
is live compatibility. Keep issue order, drafts and roughly 300-line slices where
practical; at most two workers on genuinely disjoint work within that order.
Mikołaj alone merges. Every push needs local `pnpm verify`; both required checks
must pass before `notify-bob`. Use OMP/Codex `gpt-6.1-sol` medium throughout; park
and notify on quota. No implementation worker starts before this plan is merged.
