# Linux Chromium harness

`pnpm verify` builds the unpacked MV3 extension and runs an offline detection and
download smoke through the actual Chromium action popup. Owned HTML, metadata and
generated fragmented MP4 stand in for Vimeo responses. The popup offers supported
download actions for Vimeo players and private links on other sites.
A real quality-button gesture opens the dedicated owner page
and saves native downloads. Technical track lists and source diagnostics are absent.

## Run

Use Node 24+, the pinned pnpm version, Playwright 1.64.1 and its installed
Chromium revision 1248. Linux execution needs `xvfb-run`, Python 3, libX11 and
libXtst for native consent/action key input; Playwright's Chromium dependencies
provide the X11 libraries. GTK 3 (`libgtk-3-0t64` on Ubuntu 24.04) supplies actual
Save As dialogs; the harness selects `--gtk-version=3`. FFmpeg with libx264, AAC
and x11grab generates/decodes owned media and captures native desktop frames.
`mise.toml` pins the local static build. Provision these tools before the harness;
the harness does not install system packages.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm smoke
pnpm verify
```

`pnpm smoke` expects `dist/` and runs headed Chromium under xvfb.
`pnpm verify` runs lint, typecheck, pinned Knip, build, unit checks and the smoke.
The entry point is `scripts/smoke.mjs`.

## Action entry and detection boundary

The harness opens the extension's static `manifest.json` only to obtain an
extension execution context. This bootstrap runs no popup script or detection
polling. It focuses the owned page and uses `chrome.action.openPopup()` to create
the actual action target. That target is a CDP child session, not a Playwright
Page. It must be an actual popup view; direct navigation to popup.html is not a
substitute.

This is action API activation, not a physical toolbar click or keyboard action.
It grants no `activeTab` access. Required all-sites content scripts inspect only
iframe/link references on HTTP/HTTPS parents; inline config discovery is Vimeo-only.
The worker authenticates live documents and returns only the active tab's state.

All allowed external responses must come from owned offline fixtures. Abort and
reject unexpected requests. Detection must fetch only config and manifest metadata.
The download matrix fetches only its generated initialization/media fixtures, never
keys or licenses. It does not replace fetch, downloads, permissions or worker APIs.
Required all-sites access is installed with the real manifest. No permission API
or production source-admission check is bypassed for fixtures.
The renderer CSP check inserts inline and remote script elements in an extension
document and records their actual `securitypolicyviolation` events and policy.
It must execute neither script nor make the remote request. Privileged CDP
evaluation is harness input, not evidence that production eval is permitted.


The harness reads real `chrome.action.getBadgeText` and
`chrome.action.getBadgeBackgroundColor` values per tab. `diagnostics.json` retains
the text and existing action accent `[23, 78, 111, 255]`. Checks cover discovery
before any popup opens, duplicate CDNs/frames/captures, distinct IDs, independent
tabs, background discovery, closed tabs, worker reconstruction, last-frame
removal, navigation while metadata is held, and rejection after its release.
Badge state uses only live in-memory detection, not popup refresh or storage.

## First-use notice

The action popup shows the English rights/own-risk/liability notice with a native
acknowledgement button. The proof fills the real `chrome.storage.local` quota,
activates that button and checks that failure keeps the notice visible, including
after reopening. It removes only its quota fixture and acknowledges through the
production handler. Local storage must then contain only `rightsAcknowledged: true`.
Screenshots retain fresh, failed-save, acknowledged and reopened surfaces.

After the detection/download matrix, Chromium closes and restarts with the same
profile. The harness then changes the copied unpacked manifest from 0.3.0 to 0.3.1
and installs that package through browser-level CDP `Extensions.loadUnpacked`.
It checks the loaded version, unchanged extension ID and acknowledgement. This is
a real unpacked-package update, not a simulated version read or a popup reload;
it does not claim coverage of signed release-package delivery. A separate fresh
profile must still show the notice and have empty local storage.
`notice-restarted.png`, `notice-updated.png`, `notice-separate-profile.png` and
`diagnostics.json` retain the evidence. All temporary profiles and the copied
extension are removed. The positive paths use the production acknowledgement handler.
The download proof separately challenges missing/false/invalid storage, pending and
injected unreadable reads, caller assertions, direct pages and genuine tokens revoked
before entry. It also replays a real token in another tab while consent is valid.
The popup list must be hidden with no cards or actions, while its
count and toolbar badge keep updating. A real acknowledgement must reveal cards
in the same popup. Direct dispatch must produce zero child playlist/init/media
requests and zero native saves. Copy on an existing completed
page must leave the clipboard unchanged when consent is absent or unreadable.
`rights-*.png` and `download-proof.json` retain these boundary checks. Injected
storage failures are local proof faults, not claims of an OS storage failure.
Wrong-sender state/start/source messages and an invalid popup candidate must create
no requests, native saves or extra owner page. The valid-token wrong-owner case
replaces the weaker fabricated-token-only check. `authorityRefusal` in
`download-proof.json` retains these observations.



## Offline detection matrix

HLS/DASH actions, same-document update, frame removal/navigation and execution-
context-loss checks remain in the default smoke. Required access replaces native
per-CDN deny/grant/revoke scenarios. Private-link fixtures exercise Vimeo path hashes,
player `h` hashes, exact signed query bytes, repeated-reference deduplication and
last-reference removal. Hostile hosts, malformed/duplicate hashes, unrelated inline
scripts and form values must not produce a video or request.
Parser checks cover representation, group, codec, MIME type, bandwidth, dimensions,
frame rate, language and channels. The harness checks candidate/track identity and
ordered download references through worker state, not popup technical cards.
Both CDN origins resolve without a prompt. Separate DASH is preferred without
erasing usable HLS; every track retains its own candidate's manifest.

The popup groups candidates by normalized Vimeo video ID within the active tab.
It selects one whole downloadable separate DASH candidate before clear HLS, without
mixing tracks between sources. Alternative candidates remain in worker state.
Usable progressive MP4 actions appear first on that card, with combined-media
labels and declared byte size or an explicit unknown size. Each action retains
its own candidate identity; separate pair and Audio only alternatives remain.
The action proof combines two CDN origins, two player frames and a re-captured
config and asserts one card. The matrix also asserts exactly two entries after
removing all but two distinct video IDs. `one-video-two-frames.png` and
`two-video-ids.png` retain these surfaces; protected-only entries expose no buttons.
The AVC repair fixture supplies generic `url` and H.264 `avc_url` for each DASH
CDN. It includes disabled DRM containers and returns inline base64 init only for
`base64_init=1`. The compiled resolver and action proof check AVC preference,
retained generic alternatives, untouched signed query bytes and original provenance.
An explicit `base64_init=0` case stays clear without init; positive DRM regressions remain.

An unrelated top page nests another unrelated page with Vimeo players. It also
contains an inline decoy config that must not become a result. The matrix has five
unique video IDs, an unavailable duplicate of a valid ID, malformed-first JSON
fallback, and a delayed player that exposes MPD through its config endpoint only.
Protected, unsupported and malformed results remain visible without download actions
and cannot erase valid sibling results. Switching to an empty tab and back proves
tab isolation. A held metadata response is released only after navigation to a
different successful video; the popup must retain only the new document's video
through three further polling intervals.

To prove the detector checks fail, break only the owned config-fallback response:

```sh
SMOKE_BREAK_DETECTION=1 SMOKE_ARTIFACT_DIR=/absolute/broken-detection pnpm smoke
```

This must exit nonzero because the expected MPD candidate never resolves. It retains
`failure.png`, `diagnostics.json` (failure details, actual popup text and
request audit) and `trace.zip`. It does not replace runtime messages or Chrome
APIs. Keep this evidence separate from a passing run.

## Offline download matrix

`scripts/download-proof.mjs` continues in the same owned Chromium profile.
The harness uses real CDP download behavior with suggested filenames (not GUIDs).
The baseline HLS pair now holds each real Save As dialog open for at least 32
seconds. Owned filename collisions and a real `onDeterminingFilename` suggestion
with `conflictAction: 'prompt'` force those dialogs without changing production
filenames or APIs. Native X11 input clicks the real GTK Save button; this also
works under Xvfb without a window manager to focus the dialog. Desktop frames
retain both dialogs; native state must
remain `in_progress` before accepting, and exact saved bytes must match afterwards.
The rest of the matrix restores Chromium's default filename behavior. Native Cancel
interrupts the companion; a file used as a destination directory forces a distinct
native filesystem error. Both errors suppress the merge command.

Clear HLS with protected DASH produces exactly two files. Clear DASH covers inline
video initialization and URL audio initialization. Both use at least six real
media fragments, with video segments above 2 MiB. Held responses complete out of
order with exactly five requests in flight; exact native bytes must still match
initialization-first source order. One segment returns 503 three times before
succeeding on attempt four; another exhausts all four attempts. Recorded request
times must show backoff. FFmpeg decodes both completed outputs and extracts a
1920x1080 frame from the saved video. Audio only produces exactly one audio file.
Progressive-only, mixed and unknown-size configs each save one owned combined MP4
larger than 64 MiB, proving whole files do not inherit the segment cap.
The proof compares native output byte-for-byte and decodes mandatory video/audio
maps. It asserts one direct request and native item without initialization,
segment, merge or Copy actions. Choice frames retain progressive order, unknown
size and mixed alternatives. Unsafe/protected siblings remain non-actionable;
direct redirects save nothing, and declared size above 4 GiB fails before fetching.
Repeated inline/fetched copies of the same direct URL expose one action, retaining
one whole admitted candidate rather than combining authority or metadata.
A held companion proves progress after video completes. Network failure, Cancel
and a real 30-second idle timeout must preserve the completed video and report
partial failure. Encrypted playlists, redirects and non-CDN resource origins
produce no native download. Missing-URI
audio cannot expose a quality-pair button. Every finished owner must remove its
owned temporary directory. No unrelated audio, keys or licenses may be requested.

The lifetime matrix replaces the old source-document invalidation assertion.
For paired and Audio only jobs it holds owned audio media, observes actual popup
closure, switches tabs, reopens the real popup, closes the source tab and reopens
again. Popup segment counts must reflect both held and completed states. Each
native output must exactly match its owned source, with exactly two/one saves:
reopening must not create a job. `lifetime-proof.json` and `lifetime-*.png` retain
the observations. For a scoped run after building, use
`SMOKE_LIFETIME_ONLY=1 SMOKE_ARTIFACT_DIR=artifacts/lifetime-fresh pnpm smoke`;
this runs detection/notice setup and lifetime proof, not the remaining download
matrix. Use a fresh artifact directory for each invocation.

For per-file recovery after building, use
`SMOKE_RECOVERY_ONLY=1 SMOKE_ARTIFACT_DIR=artifacts/recovery-fresh pnpm smoke`.
It runs detection/notice setup, source-closure lifetime checks and the recovery
matrix, not the remaining download matrix. Use a fresh directory every time.
The default full run includes both matrices.

`recovery-proof.json` records video/audio/Audio only cancellation during fetch
and actual native saving, followed by Retry on the same owner row. Native
filename collisions and the real determining-filename listener force GTK Save As.
The pending-state check awaits actual Downloads API results in page execution;
it does not pass an async predicate to Playwright's `waitForFunction`.
The native case activates the production Cancel button through its DOM because
GTK is modal; it does not mock Chrome downloads APIs or claim a physical click.
Desktop frames retain the pending native dialog. Each retry must produce exactly
two completed pair files or one Audio only file, with exact source bytes and no
new requests for the completed companion. A second synthetic Retry event
challenges the disabled-button guard. Network recovery also closes the source
and observes failed/completed progress in the reopened popup.

Owned route abort/403 responses prove distinct network/HTTP errors. One injected
OPFS write rejects `QuotaExceededError`; this is not real quota exhaustion.
The native error unit boundary injects the `FILE_NO_SPACE` code to prove disk-full
classification and locator redaction; no shared disk is filled. The full native
matrix separately uses a file as the destination directory to force a real
filesystem failure. Retry without stored consent must fetch/save nothing.
Every terminal attempt must remove its OPFS directory before Retry is enabled.
Native interrupted files have no completed path; rows identify any retained
`.crdownload` as partial. The screenshots and native-item audit distinguish
the owned collision fixtures from successful outputs.

Concurrency uses Chromium request lifetimes: `request` opens a slot;
`requestfinished` (after body delivery) or `requestfailed` (including cancellation)
closes it. A pending `route.fulfill()` or held fixture handler is not an outstanding
browser request. Scenario resets require zero outstanding requests and check the
previous peak before clearing it. Any peak above five fails, even if it was brief.

Before native downloads, `scripts/request-lifetime-proof.mjs` exercises this counter
with actual Chromium fetches. Five delivered responses can leave five fixture
handlers pending. One cancelled held request leaves a handler pending while the
next five requests start: six handlers, but only five outstanding requests.
The same counter must reject six simultaneously held, non-cancelled requests.
`request-lifetime-proof.json` retains both boundaries and terminal events;
`download-proof.json` retains the native matrix's segment lifecycle events.

The retained main failure (run 40665867873, artifact 12805418643) reached the
timeout partial-failure surface before the route-handler counter asserted.
The controlled scenario reproduces its accounting defect without rerunning that
CI job. The failed artifact has no per-request lifecycle log, so its exact
interleaving cannot be reconstructed. Production five-slot assembly is unchanged.

`download-proof.json` records outcomes and actual completed paths.
`download-*.png` records completion, progress and failure surfaces; generated
`owned-*.mp4` and `native-downloads/` permit exact-byte and media inspection.
The download page URL carries only a random token, never signed source locators.

## Evidence and limits

The default evidence directory is `artifacts/headed/`; CI uploads it as
`chromium-evidence`, including on failure. Override it with
`SMOKE_ARTIFACT_DIR=/absolute/evidence`. Use
`SMOKE_EXTENSION_DIR=/absolute/build` to select an owned build. Do not run two
invocations against one evidence directory.

Retain rendered action-popup screenshots, a Playwright trace, and redacted
request and popup diagnostics. CDP action targets are not Playwright Pages and
do not appear as pages in the trace. Inspect traces before sharing: they can
contain local paths, owned page contents and dummy query values. Do not record
live signed metadata URLs.

Screenshots: `all-sites-iframe.png`, `private-links.png`, `qualities.png`,
`audio-footer.png`, `worker-rebuilt.png`, `removed.png` and `navigated.png` cover
automatic detection and lifecycle scenarios. `dash-nested.png`, `dash-mpd.png`,
`unavailable-states.png`, `tab-isolated.png`, `tab-restored.png` and
`stale-response.png` cover the matrix; `dash-preferred.png` covers both CDN origins.
`diagnostics.json` records query-redacted request URLs, exact matrix fields and
popup text; `trace.zip` contains owned page interactions and dummy queries.
Neither permissions nor requests are mocked.
The worker-rebuild check kills only this fresh profile's extension renderer,
confirms the old worker context is lost, then opens the real action on the unchanged
fixture tab. The check proves loss of the prior execution context, not a change in
Playwright Worker object identity or a Worker close event.

Close the browser context and remove the fresh browser profile on success and
caught failure. SIGKILL or machine loss can prevent cleanup. Missing or invalid
builds must fail preflight rather than silently loading a different extension.

Offline fixture proof establishes the supported authored shapes and runtime
wiring, not compatibility with an authorised real Vimeo page. Live-page evidence
remains separate in [the detection plan](M2-DETECTION.md#proof-and-data-handling).
