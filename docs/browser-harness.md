# Linux Chromium harness

`pnpm verify` builds the unpacked MV3 extension and runs the offline walking
skeleton: detect the owned fixture, open the actual action popup, click its
real download button, observe Chromium completion, and read the native file.
It then opens the same fixture on an unsupported origin and rejects any stream,
download button, extra download record, or extra saved file.

## Run

Use Node 24+, the pinned pnpm version, Playwright 1.64.1 and its installed
Chromium revision 1248. Linux execution needs `xvfb-run`; do not install system
packages as part of the harness.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm smoke
pnpm verify
```

`pnpm smoke` expects `dist/` and runs headed Chromium under xvfb.
`pnpm verify` runs lint, typecheck, build, unit checks and this same scenario.
The old loading-only direct-URL smoke is replaced, not run alongside it.

## Action entry and native download

The harness discovers the extension ID in `chrome://extensions/`. It opens an
extension bootstrap tab only to obtain an extension execution context. It
fulfills `https://vimeo.com/fixture` with `test/fixtures/synthetic-vimeo.html`,
focuses that fixture tab, then calls `chrome.action.openPopup()` from the
inactive bootstrap tab through CDP with `userGesture: false`. Other external
requests are aborted and fail the run. No live Vimeo content is requested.
The unsupported case serves the same owned HTML at `https://example.com/fixture`.

The API must create a new action target. That target is a CDP child session,
not a Playwright Page. The harness checks that the target window is an actual
popup view, awaits content-script messaging, captures its rendered pixels, and
clicks its button. Focusing the bootstrap tab must destroy the popup target;
the bootstrap must survive. There is no direct-navigation fallback.

This is **action API activation**, not a physical toolbar click or keyboard
action. Playwright content input does not address browser toolbar widgets.
The API grants no `activeTab` access; production uses Vimeo-matched content
scripts. No test hook, extra permission, or mocked Downloads API is used.

A fresh profile sets `download.default_directory`. Playwright `acceptDownloads`
is disabled and CDP `Browser.setDownloadBehavior` is restored to `default`.
Do not replace this with `allow` or Playwright download acceptance: those can
save `download.txt` or a UUID rather than the extension's requested filename.
The harness waits for `chrome.downloads.search` to report `complete`, checks the
native absolute filename `vimeo-grabber-synthetic.txt`, and reads exactly 39 bytes:
`Vimeo Grabber owned synthetic fixture.` followed by a newline. A resolved
Downloads API call alone does not prove completion. The unsupported case must
leave the one completed record and the one unchanged file. This scenario does
not induce or claim a real Downloads API rejection.

Completion uses an awaited Promise with Downloads API `onCreated`/`onChanged`
listeners, an initial awaited search, and a 10-second failure deadline. Listeners
are installed before the search and removed on completion, error or timeout.
Do not use an async predicate in Playwright `waitForFunction`: with the pinned
version it accepts the returned Promise as truthy even when it resolves to false.
A controlled native transfer held open by an owned local server reproduced the
old wait returning while `in_progress`; the event wait stayed pending until the
server finished and Chromium reported `complete`. The native filename, exact
39-byte content and no-extra-download assertions remain strict.

## Evidence and failures

The default directory is `artifacts/headed/`; CI uploads it as `chromium-evidence`
even on failure. Override it with `SMOKE_ARTIFACT_DIR=/absolute/evidence`.
Use `SMOKE_EXTENSION_DIR=/absolute/build` for failure probes. Each invocation
clears its named evidence; never run two invocations against the same directory.

- `popup.png`, `unsupported.png`: rendered actual action targets, not bootstrap tabs.
- `download.json`: native Downloads API record, completion, byte count and content.
- `vimeo-grabber-synthetic.txt`: evidence copy of the verified native file, not a
  renamed Playwright download. The native path is in `download.json`.
- `failure.png`: action screenshot on failure, when its child session is available.
- `failure-tab.png`: bootstrap tab on failure; distinct from the action screenshot.
- `trace.zip`: Playwright tab snapshots and screenshots. CDP action targets are
  not Playwright Pages and do not appear in this trace.
- `diagnostics.json`: exact entry, Chromium version, target identity, popup states,
  native download, request/page/console errors, failure stack and cleanup status.
  Action attachment occurs after opening; early action console events are not
  captured. A preflight failure has no browser trace or screenshot.

Every run closes its context and removes its fresh profile and native download
scratch directory on success and caught failure. Evidence copies remain.
Cleanup errors fail the command. SIGKILL or machine loss can prevent cleanup.
Inspect traces before sharing: they contain local paths and page contents.

A useful failure probe copies `dist/` to an owned scratch directory and removes
its manifest's content-script registration. Run with both overrides. Expect a
nonzero exit, an actual action failure screenshot, a trace, diagnostics, and no
remaining profile or download scratch directory. This checks a broken detection
path, not a simulated Downloads API rejection. Missing or invalid builds fail
preflight with a `Run pnpm build first` diagnostic.
