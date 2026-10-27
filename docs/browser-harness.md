# Linux Chromium harness

The harness loads the real unpacked MV3 build, discovers its extension ID in
`chrome://extensions/`, and navigates directly to `action.default_popup`.
It does **not** click the browser toolbar or prove toolbar popup sizing or focus.
It checks the visible scaffold heading and message, title, English document,
page/console errors, failed requests, and unexpected external requests. External
page requests are blocked. No Vimeo access or video fixtures are needed.

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

## Evidence and failures

Defaults are `artifacts/headless/` and `artifacts/headed/`. Each invocation clears
its old named evidence. Do not run two invocations against the same artifact dir.

- `popup.png`: full-page screenshot of the loaded popup on the assertion path.
- `failure.png`: current page on failure, if a page exists and capture succeeds.
- `trace.zip`: Playwright screenshots, snapshots, and sources after browser launch.
- `diagnostics.json`: mode, direct-navigation entry, build/profile paths, extension
  ID when available, browser API logs, request/page/console errors, failure stack,
  and cleanup status. A preflight failure has no browser trace or screenshot.

Inspect a trace with `pnpm exec playwright show-trace artifacts/headless/trace.zip`.
A failure exits nonzero and prints the artifact directory. Build validation rejects
missing/malformed manifests, non-MV3 or wrong-name builds, and missing/escaping
popup files with a `Run pnpm build first` diagnostic. Browser assertions also
reject broken popup content or assets.

Optional environment variables:

- `SMOKE_HEADED=1`: headed browser; supply a display, normally through xvfb.
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
