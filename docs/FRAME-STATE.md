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
  on pagehide/removal, including nested frames.
- After worker restart, reconnect live matching content scripts, authenticate their
  current connections, activate their documents, and request fresh full snapshots.
  Do not restore old signed URLs. Registration and publication rebuild empty state.
  This integration needs no webNavigation, tabs or storage permission.

## Consumer contract

`frames(tab)` returns detached per-document snapshots. Activation starts ready and
empty. Publication prunes sources absent from the authoritative reference snapshot
before becoming pending. It retains previous whole candidates only for referenced
inline video IDs or exact fetched config URLs in that same document lifetime.
Completion becomes ready; rejection becomes error without retaining exceptions.
A newer publication, activation, removal or tab clearing invalidates old completions.
`publish` returns false for invalid/unregistered reports and true for admitted work,
not a promise that the document remains live or resolution succeeds.

`candidates(tab)` retains every live document's candidates, including identical
video IDs and URLs in separate frames. It adds `frameId` and `documentId`, and
scopes candidate `id` to that frame/document lifetime. Removing a frame removes
only its candidates. No tracks, sources or statuses are merged.
Resolver outputs preserve their authoritative document source.

Partial outcomes preserve usable prior DASH/HLS/progressive alternatives; newer
non-null titles update the video's candidates. Found/protected alternatives replace
older whole results for the same source, protocol, CDN and URL origin/path, including
signed-query history. Distinct alternatives in one new capture stay distinct.
No video/audio tracks are spliced. Retention is capped per frame at 256 whole
candidates and 2,097,152 serialized characters, preferring newer results. It is
in-memory only and does not change already admitted download snapshots.

Worker-only `invalidation` outcomes distinguish candidate/source access refusal and
video-wide protection from missing metadata. Candidate protection removes its former
clear alternative, source refusal clears only that source, and video-wide protection
clears old clear results for that video in the document, even with omitted manifests.
Independent documents remain separate. Explicit inline protection prunes actions
before asynchronous resolution. Native browser host-access revocation is not
simulated: connection removal and runtime navigation invalidation still clear state.

Admission limits: 32 videos, 64 config URLs, 32 manifests/video, 256 tracks/video,
8192 characters/string, 262144 serialized characters and traversal budget,
20000 visited values, depth 12. Reference URLs use HTTPS without credentials or
custom ports; config paths contain at most 20 ID digits and one optional
alphanumeric hash of at most 128 characters. Authenticated HTTP/HTTPS parent
documents may publish config references only, never inline videos. Vimeo documents
retain inline discovery. Track manifests remain CDN-scoped; transport receipts
and the CDN allowlist remain mandatory despite required all-sites browser access.

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


The popup counts unique video IDs and renders one card per video. It chooses one
whole separate DASH candidate before usable HLS, then Audio only or other results.
Alternatives remain in worker state. A DASH video-only candidate and a separate
audio-only candidate cannot form a preferred pair.
Cards show supported quality/Audio only actions or a download-unavailable reason.
Representation lists and source/CDN/frame/config diagnostics are not rendered.
Internal candidates retain every track field and provenance for download validation.
