# All-sites security review (#66)

## Inspected build and evidence

Reviewed production source at `dc045ec1232e10c6c8307ef80e4316c8f7fca29a`
(all-sites/private-reference cutover), Node 24, pnpm 10.34.8 and the frozen lockfile.
`pnpm build` produced 14 files, including 10 JavaScript files, with no source maps.
The review branch changes proof and documentation only, not production code.

Retained evidence root (outside the disposable worktree):
`/home/agent/projects/vimeo-grabber/.limen/jobs/2026-10-29-f039-all-sites-security-boundari-2798e6db/`.
`shipped-inventory.txt` records every asset's SHA-256/size and a TypeScript AST
inventory of imports, fetches, eval/Function and worker constructors; `inspected-dist/`
preserves those exact build bytes.
`native-probe/` retains the initial boundary run; `verify-final/` retains
the committed-candidate full run. Read their JSON and logs for observed results;
a directory name alone is not evidence of a pass. The PR records final commit/CI
identities separately because a commit cannot contain its own hash.

## Shipped capability and code loading

- `dist/manifest.json`: MV3, `downloads`, `storage`, required `<all_urls>` host
  permission and all-frame content scripts. No optional permissions, activeTab,
  tabs, scripting, externally_connectable, sandbox or remote background entry.
- Required broad access implements the approved automatic Vimeo iframe/private-link
  discovery on unrelated parents before opening the popup. It is a browser capability,
  not application authorization to fetch arbitrary hosts. It can cover file URLs
  if a user separately enables file access; the worker accepts only HTTP(S) documents.
- `downloads` starts/observes native saves and reads completed absolute paths.
  `storage` stores only the rights acknowledgement. Basic tabs query/create/update
  operations and per-tab badge updates do not require the `tabs` permission.
  Copy uses a user gesture; no clipboardRead/clipboardWrite permission is requested.
- No explicit CSP override: Chromium's MV3 extension-page default is
  `script-src 'self'; object-src 'self'`. The native proof inserts inline and
  remote script elements in an extension document and records actual CSP violations.
  This is not a claim that privileged CDP Runtime.evaluate obeys page CSP.
- Both HTML entrypoints use packaged module scripts, CSS and modulepreloads.
  The service-worker loader imports the packaged worker. The content loader's
  sole dynamic import uses `chrome.runtime.getURL` with a build-time literal.
  Its two web-accessible modules contain detection/normalization, not worker or
  download control. Making these bytes accessible grants no Chrome API authority
  to ordinary page scripts. Content runs in Chrome's default isolated world.
- The asset AST inventory found no eval, Function constructor, remote import,
  executable fetch consumer or Wasm loader. Metadata is parsed as JSON/XML/HLS,
  never executed. Saxes is bundled locally; MPD rejects DTD declarations.
  Vite's modulepreload fallback has a third fetch site: its input is the packaged
  extension HTML's link href, not page metadata. Chromium supports modulepreload;
  the fallback does not become an arbitrary-page fetch service.
- Harness `Runtime.evaluate`, Playwright evaluation and owned failure injection
  are test control, not shipped code. They do not establish production eval risk.

## Authority trace

1. `src/detect/content.ts` selects full config observation only on the three exact
   HTTPS Vimeo origins. Other sites use `references.ts`/`discoverReferences`:
   iframe src and anchor href only, no forms, arbitrary script text or page text.
   Numeric IDs and bounded alphanumeric private path/hash values form exact
   player config endpoints. Duplicate hashes, lookalike hosts and malformed values
   are rejected. Existing query bytes are retained, including signed query bytes.
2. `src/worker.ts` accepts only `vimeo-document` ports authenticated with Chrome's
   sender ID, tab/frame/document ID, active lifecycle, matching origin and HTTP(S)
   URL. `frame-state.ts` bounds message depth/nodes/bytes and validates exact schemas.
   Non-Vimeo senders cannot publish inline videos. Message-supplied sender data
   never substitutes for Chrome's sender. Port replacement, disconnect, navigation
   and tab removal invalidate state. An old async resolver cannot overwrite the
   newer publication because completion checks the publication object's identity.
3. `metadata.ts` accepts only HTTPS player `/video/<id>/config` endpoints. Config
   identity must match parsed video identity. Worker-local WeakMap receipts bind
   the exact config snapshot to an admitted manifest/CDN/protocol. Receipts cannot
   be serialized into Chrome messages. Inline receipts require authenticated Vimeo
   discovery. Manifest requests require exact receipt membership and Vimeo CDN
   suffix matching, not a substring or the broad manifest host grant.
4. Only the actual popup URL without `sender.tab` can read tab state or start
   downloads. `selection` requires a live candidate and compatible separate tracks.
   Consent is read from storage, not trusted from caller assertions. A UUID maps
   to a worker-held source snapshot and the created owner tab ID (maximum 16).
5. `download-source` requires the extension sender, exact download URL/token,
   recorded owner tab ID and current consent. A genuine token copied into a second
   tab is refused. Owner closure deletes its intent; worker restart loses intents.
   An already admitted owner continues with its local snapshot after worker restart.
   Tokens are not single-use: the same owner can reload while its intent exists.
   That is recovery authority, not cross-tab bearer authority. Source-tab closure
   intentionally does not revoke an already admitted download snapshot.
6. `download/page.ts` accepts progress queries only from the actual popup with the
   matching token. Owner pagehide aborts work. Each request/read/save checks consent
   and lifetime; each resource must remain HTTPS Vimeo CDN, without credentials,
   custom port or fragment. Native saves consume locally assembled blob URLs,
   never an arbitrary remote downloads URL. Object URLs survive until native
   terminal state, then are revoked. Temporary OPFS files are removed on terminal
   attempts; the next serialized owner cleans crash orphans.

## Network, data and protection boundaries

`metadata.ts` and `download/assemble.ts` use credentials omit, manual redirects
and no-referrer. Metadata also uses no-store, an 8-second deadline and 1 MiB cap.
Redirects are not followed, even to another CDN. Download assembly validates the
entire resource list before initialization/media fetch and enforces ordered,
clear, separate ISO-BMFF initialization and bounded resources/bytes.

HLS encryption/session-key declarations, DASH ContentProtection and active DRM
config declarations do not authorize key/license requests. Disabled DRM containers
alone are not evidence of protection. Clear alternatives remain supported.
Initialization refuses protected sample codecs/boxes. No EME, license transport,
key retrieval or authentication bypass implementation exists. This is not a claim
that arbitrary malicious bytes can always be identified as a key by their URL;
the supported parsers refuse declared encryption and unknown addressing forms.

Production has no console logging, telemetry, analytics or account endpoint.
Detection candidates, titles, frame URLs and signed queries remain in memory;
worker errors discard arbitrary exception text. UI uses textContent, not HTML
insertion; download errors use a bounded safe vocabulary. Progress includes actual
local filenames/paths, not source queries. Chromium's own history and completed
files persist; OPFS crash orphans can persist until the next owner. The acknowledgement
is the only local extension-storage field. See README Permissions/Privacy.

## Disposition and release boundary

No reproducible production security defect was established by this review. No
production hardening or permission reduction is included. Severity: no supported
finding to assign; no unresolved security release blocker identified for #53.
This is bounded evidence, not a security guarantee or owner release approval.

The native proof extends the old unowned-token check to replay a genuinely minted
owner token in a second tab with valid consent. It also sends state/start/source
messages from an unauthorized extension tab and an invalid candidate from the real
popup. It asserts zero child/media requests, zero native saves and no extra owner
job; it does not mock message sender, fetch, downloads or permission APIs.
Existing held-navigation, private-reference, hostile-origin, encrypted-playlist
and redirect cases remain. The default full run also preserves consent, source
closure, recovery, long Save As, badge, exact 1080p, title/Copy and no-overwrite proof.

Limits: owned offline responses only; no live Vimeo, other extensions, compromised
browser/extension renderer, signed-store update, OS security settings or exhaustive
fuzzing. CodeQL and Knip supplement this review; neither proves runtime authority.
Final own-machine acceptance and all remaining product/release gates in #53 remain
with the owner. No release operation is authorized here.
