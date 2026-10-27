# Linux Chromium harness

`pnpm verify` builds the unpacked MV3 extension and runs an offline detection
smoke through the actual Chromium action popup. Owned HTML and metadata stand in
for Vimeo responses. The popup lists video and audio qualities from matching
Vimeo frames, including a player under an unrelated top page. There is no
synthetic save path, Downloads API, or download control.

## Run

Use Node 24+, the pinned pnpm version, Playwright 1.64.1 and its installed
Chromium revision 1248. Linux execution needs `xvfb-run`, Python 3, libX11 and
libXtst for native permission-dialog key input; Playwright's Chromium dependencies
provide the X11 libraries. Do not install system packages as part of the harness.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm smoke
pnpm verify
```

`pnpm smoke` expects `dist/` and runs headed Chromium under xvfb.
`pnpm verify` runs lint, typecheck, build, unit checks and the smoke.
The entry point is `scripts/smoke.mjs`.

## Action entry and detection boundary

The harness opens an extension bootstrap tab only to obtain an extension
execution context. It focuses the owned page and uses `chrome.action.openPopup()`
to create the actual action target. That target is a CDP child session, not a
Playwright Page. It must be an actual popup view; direct navigation to popup.html
is not a substitute. Chrome closes this popup when it shows the native permission
dialog; the harness reopens the action after each decision.

This is action API activation, not a physical toolbar click or keyboard action.
It grants no `activeTab` access. Production content scripts run in matching HTTPS
Vimeo frames only. Unrelated top pages do not gain a content script or host grant.
The worker authenticates live documents and returns only the active tab's state.

All allowed external responses must come from owned offline fixtures. Abort and
reject unexpected requests. Only config and manifest metadata may be fetched;
never media, segments, initialization data, keys, or licenses. Optional CDN
permission requests must use the real Chrome API after a real popup gesture and
contain only an encountered exact HTTPS origin. Never grant the declared CDN
wildcard or add a production permission bypass for a test.

## Offline detection matrix

The original HLS action, native deny/grant/revoke, same-document update, frame
removal/navigation and execution-context-loss checks remain in the default smoke.
The same granted exact origin serves the additional owned DASH JSON and MPD
fixtures. The popup asserts every video/audio field, including representation,
group, codec, MIME type, bandwidth, dimensions, frame rate, language and channels.

An unrelated top page nests another unrelated page with Vimeo players. It also
contains an inline decoy config that must not become a result. The matrix has five
unique video IDs, an unavailable duplicate of a valid ID, malformed-first JSON
fallback, and a delayed player that exposes MPD through its config endpoint only.
Protected, unsupported and malformed metadata remain visible without tracks and
cannot erase valid sibling results. Switching to an empty tab and back proves
tab isolation. A held metadata response is released only after navigation to a
different successful video; the popup must retain only the new document's video
through three further polling intervals.

To prove the detector checks fail, break only the owned config-fallback response:

```sh
SMOKE_BREAK_DETECTION=1 SMOKE_ARTIFACT_DIR=/absolute/broken-detection pnpm smoke
```

This must exit nonzero because the MPD qualities never appear. It retains
`failure.png`, `diagnostics.json` (missing expected text, actual popup text and
request audit) and `trace.zip`. It does not replace runtime messages or Chrome
APIs. Keep this evidence separate from a passing run.

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

Screenshots: `permission-needed.png`, `denied.png`, `qualities.png`,
`audio-footer.png`, `worker-rebuilt.png`, `revoked.png`, `removed.png` and
`navigated.png` cover the existing scenarios. `dash-nested.png`, `dash-mpd.png`,
`unavailable-states.png`, `tab-isolated.png`, `tab-restored.png` and
`stale-response.png` cover the additional matrix. `diagnostics.json` records dummy
request URLs, exact matrix fields and popup text; `trace.zip` contains the owned
page interactions. Native X11 Escape denies the prompt; Tab then Return selects
Allow. Neither permissions nor requests are mocked.
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
