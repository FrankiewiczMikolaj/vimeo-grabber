# Frame discovery state

`src/worker.ts` composes `src/detect/frame-state.ts` with the metadata resolver.
Its resolver takes `(PageDiscovery, authoritativeFrameUrl)` and returns readonly
`PlaybackCandidate[]` (see [candidate resolution](discovery-resolution.md)).
The resolver is trusted worker code. It must apply metadata admission before any
fetch; this broker does not fetch or grant permissions. Payload video IDs identify
videos only, never tabs, frames or documents.

## Runtime integration

- Construct one broker with `chrome.runtime.id` on each worker start. Keep URLs in
  memory only. Do not persist snapshots or log envelopes, results or exceptions.
- Pass the actual Chrome `MessageSender` to `validateFrameDiscovery` before any
  activation. The only envelope is `{ type: 'frame-discovery', discovery }`.
  No payload identity fields, extra fields or arbitrary fetch requests are accepted.
- The runtime owns live document registration. After authenticating a current
  content-script connection, call `activate(sender.tab.id, sender.frameId,
  sender.documentId)`, then `publish(envelope, sender)` for each fresh snapshot.
  Do not activate on every message: that would let a late publication replace a
  newer document. Document activation must follow live connection establishment,
  not a delayed resolver completion. Chrome's active lifecycle alone is not a
  navigation event or proof that a previously queued message is still current.
- On a document connection's disconnect/removal, call `remove(tab, frame, document)`.
  A late disconnect from the previous document cannot remove its replacement.
  A frame replacement must activate the new document before admitting its reports.
- On top-document navigation start and tab removal, call `clearTab(tab)` even if
  the destination is unrelated and cannot run a content script. Basic
  `chrome.tabs.onUpdated` loading status and `onRemoved` do not require the `tabs`
  permission; do not read privileged tab URL fields. Frame connections must close
  on pagehide/removal, including nested frames. Use `clear()` when retiring the broker.
- After worker restart, reconnect live matching content scripts, authenticate their
  current connections, activate their documents, and request fresh full snapshots.
  Do not restore old signed URLs. Registration and publication rebuild empty state.
  This integration needs no webNavigation, tabs or storage permission.

## Consumer contract

`frames(tab)` returns detached per-document snapshots: activation starts ready and
empty; publication replaces old results with pending; completion becomes ready;
rejection becomes error with no retained exception. A newer publication, activation,
removal or clear invalidates the old completion, including old errors.
`publish` returns false for invalid/unregistered reports and true for admitted work,
not a promise that the document remains live or resolution succeeds.

`candidates(tab)` retains every live document's candidates, including identical
video IDs and URLs in separate frames. It adds `frameId` and `documentId`, and
scopes candidate `id` to that frame/document lifetime. Removing a frame removes
only its candidates. No tracks, sources, statuses or permission origins are merged.
Resolver outputs preserve their authoritative source and exact missing origins.

Admission limits: 32 videos, 64 config URLs, 32 manifests/video, 256 tracks/video,
8192 characters/string, 262144 serialized characters and traversal budget,
20000 visited values, depth 12. URLs use HTTPS without credentials or custom ports;
config URLs target player.vimeo.com video config paths. Inline manifest alternatives
may name unsupported HTTPS hosts so a valid later fallback survives admission.
Track manifests remain CDN-scoped. Only MetadataTransport grants fetch authority:
its receipts, CDN allowlist and exact-origin permission checks remain mandatory.

`mise exec -- node --test test/frame-state.test.mjs` builds the core and loads it
in an offline Chromium MV3 worker. A real content script proves Chrome sender
admission. Deferred resolutions exercise replacement, invalidation, errors,
candidate/document identity, tab isolation and restart-style rebuilding. The test
owns and removes its temporary extension/profile; no live metadata or media is used.

The content script connects before reporting. Chrome port sender fields authenticate
activation; a publication cannot activate a document. Disconnect/pagehide removes
that document, tab loading clears all its frames, and reconnect requests a full
snapshot. The Navigation API reconnects and rescans on same-document URL changes.
Chrome retains the document's original URL in `port.sender.url` after pushState,
even on a new connection (observed in the offline smoke). Report requests supply
that authoritative URL back to content scripts for inline provenance; discovery
still uses the current location for config fallback candidates. Worker restarts
rebuild from content-script reconnects, without restoring old results.

The popup requests an encountered exact origin in its click stack. Chrome closes
the popup to display its native permission dialog. The worker keeps only a
tab-scoped in-memory record that a request was attempted; reopening checks actual
Chrome permission state and says “not granted or was denied” if still ungranted.
It never infers that an abandoned or failed request was an explicit refusal.
Grant/revocation events replay reports and invalidate earlier resolution results.

The popup counts unique video IDs but renders each candidate independently.
For each video, the first found DASH candidate with both separate video and audio
is marked preferred and listed first. HLS remains visible. A DASH video-only
candidate and a separate audio-only candidate cannot form a preferred pair.
Permission controls depend on each candidate's missing origin, never another
candidate's success. Denial/revocation notices are shared only for that exact origin.
