# Frame discovery state

`src/detect/frame-state.ts` is an inactive core, not a runtime message listener.
Its resolver takes `(PageDiscovery, authoritativeFrameUrl)` and returns readonly
`{ video: NormalisedVideo, permissionOrigins: readonly string[] }[]`.
The resolver is trusted worker code. It must apply metadata admission before any
fetch; this broker does not fetch or grant permissions. Payload video IDs identify
videos only, never tabs, frames or documents.

## Later runtime integration

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

`videos(tab)` prefers a whole live `found` result with tracks for each video ID.
Equivalent results use the lowest frame ID. It does not combine tracks, source URLs
or permission origins across documents.
When that frame disappears, the next live result supplies all provenance. Resolver
outputs must preserve their authoritative source and exact permission origins.

Admission limits: 32 videos, 64 config URLs, 32 manifests/video, 256 tracks/video,
8192 characters/string, 262144 serialized characters and traversal budget,
20000 visited values, depth 12. URLs use HTTPS without credentials or custom ports;
config URLs target player.vimeo.com video config paths and manifests target only
vimeocdn.com or its subdomains. Schema checks do not establish fetch receipts.

`mise exec -- node --test test/frame-state.test.mjs` builds the core and loads it
in an offline Chromium MV3 worker. A real content script proves Chrome sender
admission. Deferred resolutions exercise replacement, invalidation, errors,
whole-result deduplication, tab isolation and restart-style rebuilding. The test
owns and removes its temporary extension/profile; no live metadata or media is used.
