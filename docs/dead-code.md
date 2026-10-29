# Dead-code checks and cleanup evidence

Run `pnpm deadcode` for pinned Knip 6.43.0. `pnpm verify` runs it after ESLint
and TypeScript. TypeScript enables `noUnusedLocals` and `noUnusedParameters`;
ESLint's recommended JavaScript and TypeScript rules check unused bindings in
source, scripts and tests. CI uses the same locked command, with no network
lookup by Knip. No dependency or export category is disabled.

## Entrypoints and exceptions

- `vite.config.ts` is Vite's config entry. Its CRXJS manifest supplies the
  service worker (`src/worker.ts`), static all-frame content script
  (`src/detect/content.ts`) and action HTML (`popup.html` → `src/popup.ts`).
  Knip does not follow the nested CRXJS manifest, so these three TypeScript
  roots are explicit in `knip.json`.
- Vite's `build.rollupOptions.input.download` supplies `download.html` →
  `src/download/page.ts`; Knip's Vite plugin follows this HTML input.
  The worker opens this page using `chrome.runtime.getURL`, not an import.
- `scripts/smoke.mjs` is invoked through `xvfb-run -a env SMOKE_HEADED=1 node`
  in the package smoke script. It imports `download-proof.mjs`, which imports
  `request-lifetime-proof.mjs` and `segment-requests.mjs`. Only the shell-wrapped
  root needs an explicit entry; helpers are reached through imports.
- Node's test script selects `test/*.test.mjs`. Knip's test/Vite plugins follow
  these tests and their build-library entry strings. Tests use compiled modules
  in generated workers, data URLs and browser evaluation strings.
- `.omp/extensions/limen.ts` and `.pi/extensions/limen.ts` are external agent-loader
  entries. Each exports its host callback and dynamically imports installed
  Limen hooks from `LIMEN_PACKAGE` or PATH. Neither is extension bundle code.
- `ffmpeg` is the only `ignoreBinaries` exception: it is a system executable,
  pinned locally by `mise.toml` and installed with apt in CI. The native download
  harness calls it to generate, decode and merge owned media. It is not an npm
  dependency. There are no ignored files, dependencies or exports.

Knip does not prove CSS selector, JSON/HTML/media fixture or prose reachability.
Those need manual review. TypeScript API types used through exported signatures
are not necessarily imported by name. Knip also does not detect arbitrary object
methods reached only by tests; the broker's removed `clear()` was such a finding.

## Removals and reachability

Baseline: main `be179903aba2cbab3c464ce343b69da25007e419`.

- **Source exports:** removed only `export` from `METADATA_LIMIT` and
  `METADATA_TIMEOUT` in `src/detect/metadata.ts`. Repository references occur
  only in that module's request timeout and body/header size checks. Values and
  checks remain. Removed only `export` from `HlsTrack` and `HlsAudioRendition`
  in `src/detect/hls.ts`; both remain local types for the parser's result/data.
  No import or browser-evaluation string consumes these four names elsewhere.
- **Source method:** removed `createFrameState().clear()`. The sole production
  broker is in `src/worker.ts`; it uses `activate`, `publish`, `remove`, `frames`,
  `candidates` and `clearTab`, never `clear`. Browser worker teardown drops the
  broker itself. Repository-wide `clear()` call review found only the test case.
- **Tests:** removed the `clear` branch from the frame-state invalidation matrix
  and its conditional tab-isolation exception. Kept activation, document removal
  and tab clearing, each rejecting a held stale completion and preserving the
  other tab. No test file or supported-path regression was removed or added.
- **Docs:** removed instructions to retire a broker with `clear()` and stale
  independent-card/first-DASH wording in `docs/FRAME-STATE.md`; current popup
  ranking selects one whole candidate per video and retains other candidates.
  Removed future-runtime/future-writer descriptions in `docs/metadata.md`,
  `docs/config-discovery.md`, `docs/config-normalisation.md`, `docs/dash-json.md`.
  Scoped zero-media smoke wording to the detection phase in `docs/dash-mpd.md`.
  Marked the initial setup limits as dated in `docs/github-setup.md`, retaining
  the dated observations. Replaced README's obsolete manifest-unit-test wording.
- **Popup UI:** deleted `trackItem`, its representation list, the source and
  protocol/CDN/frame/config lines, and preferred-protocol commentary. Removed
  the unused `Track` import and popup-only `h3`/`dl`/`dt`/`dd` rules. The shared
  `.tracks` styling remains live on the download page. Smoke no longer reads
  technical cards; worker-state checks and all data-level parser fixtures remain.
- **Scripts, fixtures and dependencies:** no dead file or dependency found.
  All eight fixtures still serve data-level tests; none is UI-only. Knip reports
  no unused or unlisted npm dependency after the entrypoint map.

## Manual coverage and retained behavior

- **All source:** read detect parsers/model/protection, discovery/observer/content,
  transport/resolver/frame state; popup and worker; download selection, init,
  assembly, filenames/page; Linux shell generation. The explicit owner exception
  deletes technical UI, not internal data. No acknowledgement repair, permission
  cutover, Save As or filename-behavior change is included.
- **CSS and HTML:** remaining selectors match popup eyebrow/articles/permission
  controls/footer and download-page rows/buttons. Both HTML scripts are live
  build entries. The detection-only header is replaced with current capabilities.
- **All four scripts:** smoke owns real action/permission/notice lifecycle;
  download proof owns native saves/ffmpeg; lifetime proof challenges cancellation
  accounting; segment helper observes request terminal events. Failure-injection
  flags and evidence-directory options are documented executable proof paths.
- **All twelve test files:** behavior coverage remains for parser boundaries,
  provenance, permission admission, stale completion, observation and discovery,
  candidate-bound selection, assembly limits, filenames and literal shell paths.
  The composition test protects rejection of unsupported hosts before fallback;
  it is not a mock echo. The only retired branch exercised the dead broker method.
- **All eight fixtures:** `player-configs.json` is read by normalisation tests;
  `dash-json.json` by JSON tests, the AVC helper and smoke; `dash-mpd.mpd` and
  `hls-master.m3u8` by parser tests and smoke; both discovery HTML files by discovery
  tests; `dash-avc-config.json` by `dash-avc-response.mjs`, imported by resolver
  tests and smoke. Unknown/negative fixture fields exercise ignored metadata,
  progressive rejection, malformed-first fallback or inactive DRM; keep them.
- **Docs/spec:** read README and all docs, active download tickets, historical
  scaffold notes and quality report; reviewed historical feature references.
  Preserve human-owned vision, board, ticket/outcome files, dated M2 plans and
  prior-run evidence. Historical claims refer to their recorded revisions, not
  current code. No active worker evidence is removed.
- **Config:** reviewed package scripts/dependencies/lockfile, TS/Vite/ESLint,
  both HTML entries, mise/gitignore, CI/CodeQL/Dependabot, issue/PR templates,
  CODEOWNERS, agent styleguide and both Limen loaders. `saxes` is bundled by the
  MPD parser; all development dependencies serve build, types, lint, harness or
  the new guard. CI still invokes `pnpm verify`; no workflow bypass is added.

Current wording review also covers download progress/commands, the rights notice
and footer, manifest name/description, templates, privacy statements and comments.
The manifest name and legal/notice copy remain accurate. There is no standalone
privacy file; README accurately describes local acknowledgement storage and
in-memory signed URLs. Metadata-only comments describe individual pure/transport
modules, not the whole extension. Historical M2/spec notes are marked as historical,
not rewritten as current capability claims. The PR contains exact old/new wording.
README distinguishes released detection-only v0.3.0 (no extension zip asset)
from this unreleased download-capable checkout, and covers release-source install,
usage, merge, permissions, privacy, disclaimer, limits and FAQ. Current docs point
to that guide; final release polish and queued functional fixes are not claimed.
No pre-download byte-size metadata exists in Track; none is invented. Current
progress reports observed MiB and displays Chrome's negative unknown total as
`unknown`, not a negative size. Size discovery is not part of this cleanup.

The required-host-access cutover removes the optional CDN permission flow together:
manifest declaration, popup origin discovery/request/poll/revocation, worker attempt
state and replay hooks, transport permission results, download grant checks and
native deny/grant/revoke fixtures. Required `<all_urls>` replaces browser grant
negotiation, not Vimeo-only endpoint, receipt, consent or media-source admission.
`pnpm deadcode` checks orphan files/exports; source searches check obsolete APIs,
states and UI wording. Historical feature tickets remain records, not current contracts.

## Tool observations

The default Knip scan reported 12 unused files, 3 unused exports and 4 unused
exported types. These were not safe deletions: the entrypoint map removed its
false positives and exposed the real findings. The precise configured baseline
reported 2 unused exports and 2 unused exported types (the four names above),
with no unused dependency finding. After cleanup Knip emitted no diagnostics.
The initial TypeScript invocation with both unused flags emitted no diagnostics;
ESLint also passed before cleanup. An orphan `src/unused-proof.ts` challenge made
`pnpm deadcode` exit 1 with `Unused files (1)`; the temporary file was removed.

Raw before/after tool output, scoped frame-state results, full native verification,
screenshots and hosted-check metadata are retained with the job evidence and
linked in the PR body. Empty Knip output is a successful scan, not a claim that
all runtime, CSS or prose dead code can be proved absent automatically.

## Per-file recovery cutover (#62)

- Removed the page-wide irreversible abort controller and shared native ID.
  Each queued file owns a fresh controller; the native ID now lives only inside
  its save attempt. The owner lock still serializes OPFS use across pages.
- Replaced the one-pass track loop and completed counter with persistent rows,
  a serial pending-attempt drain and completed-path map. Completed rows cannot
  enqueue again. Retry waits for all segment jobs/writers/native state and OPFS
  cleanup; no compatibility path or append/resume implementation remains.
- Replaced the plain Audio only success scenario with fetch/native cancel-and-retry
  cases that retain the same exact one-file/byte assertions. Empty/Unicode naming,
  global Cancel, native USER_CANCELED, retry exhaustion and long Save As remain
  separate boundaries, not duplicate recovery checks.
- `NativeSaveError` is reached by the owner's native terminal/start boundary.
  Its unit case checks synthetic disk-full/filesystem/cancellation classification
  and signed-locator redaction; it does not claim real disk exhaustion.
- Knip follows the new native-error module through the page import. No permission,
  dependency, worker admission or shell-command path changes in this cutover.
