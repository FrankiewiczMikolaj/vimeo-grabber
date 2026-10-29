# M3 Download

These are the unreleased checkout's contracts, not the published v0.3.0 feature set.
See README for release installation, usage, permissions, privacy, disclaimer and FAQ.
Download, Audio only and Copy require the stored boolean `rightsAcknowledged === true`.
Loading, missing, invalid or unreadable storage fails closed. Chrome can show Save As
according to its download settings; each native save waits without a network timeout.

## Outcome and boundary

Save selected Vimeo video and audio as two correct files, then show a safe Linux
ffmpeg merge command. Vimeo-only, English, no extension-side mux, authentication
bypass, key/license retrieval or browser-store publication. CI uses owned fixtures;
Bob performs the requested live checks in his browser.

## Implementation contracts

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
   preserve the footer and show the notice for a fresh install/profile. Keep popup
   and toolbar counts visible and updating; hide video cards/actions until storage
   confirms consent, then reveal the list immediately in the same popup. Independently
   check stored consent in worker dispatch/source, page authority before resource
   retrieval/native save, and every Copy attempt, including already open pages.

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

Owned fragmented-media fixtures decode to 1920x1080 video and matching audio.
The native Chromium proof checks multi-MiB segments, held out-of-order responses,
five concurrent requests, three retries after the initial attempt and exhaustion.
It compares completed native file bytes with the source and decodes those files.
It also covers HLS-first/second-origin DASH, deny/revoke, candidate identity,
malformed data, popup closure and partial completion.
Assembly has a 4 GiB per-file cap, a 64 MiB per-media-segment cap and a 1 MiB
initialization/playlist cap, with no per-read cap. Five disk-backed segment slots
bound lookahead to 320 MiB beyond the output file. Initialization is validated
and written first; each batch is appended in source order before the next starts.
Only network/read failures and HTTP 408/429/500/502/503/504 retry, after
200/400/600 ms. Authority, cancellation, DRM and storage failures do not retry.
Per-file bars report segments and MiB; retry/failure text and the keep-tab-open
instruction stay on the owner page. Native completion alone publishes a path.
The 30-second inactivity watchdog covers assembly network fetching only; it is
disarmed before closing the assembled file or awaiting native saving. Native
`downloads.onChanged` terminal events and an initial state read cover fast
completion. Object URLs remain live until completion or interruption. Native
`USER_CANCELED` displays “Save cancelled”; other native errors retain their code.
Initial admission authenticates the popup, live source candidate and selected tracks.
The owner keeps that admitted snapshot in memory, independent of later source-tab
closure or navigation and worker sleep. Consent, exact-origin permission and Cancel
remain checked while fetching and saving, without a native-save elapsed-time deadline.
The popup discovers extension owner contexts without new permissions and reads only
status and segment counts from authenticated owner responses. It never restarts a job.
No browsing/media URL is persisted. Closing an owner removes its broker intent;
the in-memory broker admits at most 16 outstanding owner intents.
Retire weaker tests rather than duplicating paths. Live Vimeo never gates CI.

### Linux merge command

After both native files complete, the download tab offers **Copy command**.
Check `ffmpeg -version` in bash/zsh; Debian/Ubuntu users can install it with
`sudo apt install ffmpeg`. Paste the displayed command into the terminal.
Inputs are the actual absolute native paths, including uniqueness suffixes.
POSIX single quoting preserves apostrophes and shell-shaped titles literally.
`-map 0:v:0 -map 1:a:0 -c copy` merges without transcoding; `-n` refuses an
existing output. The `<Title>.mp4` output sits beside the saved video and uses the
original safe title, not a name derived from either saved input. Both source files
remain. If the output exists, change only the final output path in the command
to an unused name, or rename the existing file. Keep both input paths unchanged.
Audio only and unsuccessful pairs have no ready command.
Clipboard errors show a manual-copy instruction. Use at your own risk and only
for content you have rights to download.

Requested pair names are `<Title> - video <quality>.mp4` (for example, `1080p`)
and `<Title> - audio.m4a`;
Audio only uses the same audio rule. Path separators, control/format characters
and reserved filename punctuation become spaces. Leading/trailing dots and
spaces are removed. The title stem is limited to 96 UTF-8 bytes, leaving room
for quality/role/extensions and native suffixes; empty titles use `vimeo-ID`.

Reproduce offline with `pnpm build` then
`SMOKE_ARTIFACT_DIR=artifacts/merge-proof pnpm smoke` (use a fresh evidence directory).
The real Chromium proof copies the displayed command through the clipboard,
executes it with owned H.264/AAC tracks, checks copy mappings and decodes output,
compares unchanged source bytes, refuses an existing output without changing it,
and checks that shell-shaped titles execute no extra command. Native title-name
checks cover collisions, empty and long Unicode titles, and titles containing
`video 1080p (1)` without stripping that text from the merge output.
Inspect the proof artifacts:
`merge-*-copied.png`, `merge-*-copy-failed.png`, `merge-*.sh`, `merge-*.json`,
`download-*-running.png`, `download-audio-*.png` and `download-proof.json`.
The clipboard error screenshot uses an injected write failure, not an OS failure.

Offline fixture proof is not a claim that every live Vimeo video is supported.
Keep live results separate from CI evidence and state the tested build and limits.
Mikołaj alone merges. Every push needs local `pnpm verify`; final-head Verify
extension and CodeQL plus a fresh main comparison are required before readiness.
Current sequencing and owner approval requirements are in canonical `spec/build.md`;
the coordinator owns readiness notification.
