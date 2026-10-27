# Linux Chromium harness

The harness loads the real unpacked MV3 build and discovers its extension ID in
`chrome://extensions/`. Headless mode opens `action.default_popup` in a tab.
Headed mode uses `chrome.action.openPopup()` and inspects the separate Chromium
action popup target. Neither path is a physical toolbar click.
Both check the heading, title and English document. The bootstrap tab records
page/console errors and failed requests; its external requests are blocked.
No Vimeo access or video fixtures are needed for this loading smoke.

## Run

Use Node 24+, the pinned pnpm version, Playwright 1.64.1, and its installed
Chromium (revision 1248). Both modes use `channel: 'chromium'`, not Chrome or the
headless shell. Linux headed execution also needs an installed `xvfb-run`.
Do not install system packages as part of this harness.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm smoke
xvfb-run -a env SMOKE_HEADED=1 pnpm smoke
pnpm verify
```

`pnpm smoke` expects an existing `dist/`. `pnpm verify` retains the combined
lint, typecheck, build, manifest security unit checks, and headless smoke contract.
The headed path is separate so CI can call either mode without a script change.

## Action entry and limits

`SMOKE_HEADED=1` first opens an extension tab solely to obtain the existing
extension execution context; no service worker or test hook is added. It focuses
the initial blank tab, then calls `chrome.action.openPopup()` from the inactive
extension tab using CDP `Runtime.evaluate` with `userGesture: false`.
There is no direct-navigation fallback if that API fails.

The action must create a **new** target. CDP attaches to that target, checks that
`chrome.extension.getViews({type: 'popup'})` includes its own window, and captures
its rendered pixels. Focusing the bootstrap tab must destroy the action target
and leave zero popup views while the bootstrap survives. A tab displaying the
same URL cannot satisfy these checks.

Observed on Playwright 1.64.1 / Chromium 156.0.8078.4 (revision 1248), under xvfb:

- **Action API:** opens the real 340 × 267 action view without a user gesture.
- **Keyboard:** the built manifest has no `commands` binding. The attempted
  `chrome.commands.getAll()` reports `Cannot read properties of undefined
  (reading 'getAll')`. No keyboard action is claimed.
- **Physical click:** not exercised. Playwright content mouse/keyboard APIs do
  not address browser toolbar widgets; `xdotool` is not installed on this host.
  No system packages or production shortcut bindings were added.
- **Plain popup URL:** retained only as the headless smoke and headed bootstrap.
  It is not evidence of toolbar activation.

For the fixture end-to-end slice, replace the initial blank tab with the fixture
tab and focus it before this action entry. The CDP child session is the popup
interaction seam, not a Playwright `Page`: the attempted
`context.waitForEvent('page', {timeout: 3000})` timed out despite the new popup
target. This loading smoke does not prove download activation. The popup now
uses narrowly matched Vimeo content scripts rather than `activeTab`: opening via
the action API must not be treated as granting that permission. Chrome documents
the API's version restrictions in the
[action reference](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup).

## Evidence and failures

Defaults are `artifacts/headless/` and `artifacts/headed/`. Each invocation clears
its old named evidence. Do not run two invocations against the same artifact dir.

- `popup.png`: rendered action-target screenshot in headed mode; full-page tab
  screenshot in headless mode. A later failed assertion can leave this image.
- `failure.png`: bootstrap/current tab on failure, not necessarily the action.
- `trace.zip`: Playwright bootstrap screenshots, snapshots and sources. The CDP
  action target is not a Playwright page and is not included in that trace.
- `diagnostics.json`: mode, exact entry, build/profile paths, extension ID,
  browser API logs, request/page/console errors, failure stack and cleanup status.
  Headed mode adds Chromium version, keyboard probe error, raw action API result
  or exception, target identity, popup DOM/size, target destruction and bootstrap
  survival. Attachment occurs after `openPopup` resolves: initial action-target
  console/network events are not captured. The existing tab diagnostics remain.
  A preflight failure has no browser trace or screenshot.

Inspect a trace with `pnpm exec playwright show-trace artifacts/headless/trace.zip`.
A failure exits nonzero and prints the artifact directory. Build validation rejects
missing/malformed manifests, non-MV3 or wrong-name builds, and missing/escaping
popup files with a `Run pnpm build first` diagnostic. Browser assertions also
reject broken popup content or assets.

Optional environment variables:

- `SMOKE_HEADED=1`: require a real action popup; supply a display through xvfb.
- `SMOKE_EXTENSION_DIR=/absolute/build`: override `dist/` for negative probes.
- `SMOKE_ARTIFACT_DIR=/absolute/evidence`: isolate and retain a run's evidence.

Every browser run uses a fresh profile inside its artifact directory. The harness
awaits context closure and removes the profile on success and caught failure,
including screenshot/trace failures; cleanup errors fail the command. It cannot
guarantee cleanup after SIGKILL, machine loss, or a browser close that hangs.
Traces can contain local paths and page contents; inspect before sharing them.

A useful failure probe copies `dist/` to an owned scratch directory, changes its
popup heading, and runs with both overrides. Expect nonzero status, `failure.png`,
a trace, diagnostics, and no remaining `chromium-*` profile or browser using it.
Never mutate a build another process is using. Keep missing-build and malformed
manifest probes too; they should fail before creating a browser profile.
