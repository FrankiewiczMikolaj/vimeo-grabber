# Vimeo frame observation

`src/detect/observe.ts` exports `observePage(window)`. Pass the actual window of
one matching document. It checks `window.location.origin` before reading its DOM:
only HTTPS `vimeo.com`, `www.vimeo.com`, and `player.vimeo.com` are accepted, with
no nonstandard port. Unsupported origins throw `Unsupported frame origin`.
There is no caller-supplied URL that can authorise an unrelated document.

## Subscription and lifetime

- `subscribe(listener)` synchronously rescans the live document and reports its
  current `PageDiscovery`, even when unchanged. It returns an unsubscribe function.
  Each registration has its own lifetime, even with a shared callback. Treat snapshots as read-only.
  A changed rescan first notifies existing active registrations, then registers
  and delivers once to the new subscriber. A queued automatic scan cannot swallow
  that change or duplicate the new subscriber's initial snapshot. The reference-only
  observer follows the same subscription and lifetime rules.
- Script/iframe insertion, removal, text edits, and `src`/`type` changes schedule
  discovery. Mutation batches share a queued microtask; unrelated DOM edits do not
  trigger rescans. No polling or page-world hooks are installed.
- Buffered and later resource timing entries supply recognised player config URLs.
  Discovery retains signed query bytes, repeated keys and empty values. Resource
  candidates remain in memory for this observation's lifetime, even if DOM changes.
- Automatic scans use the unchanged `discoverPage` contract. Identical ordered snapshots
  do not report again; explicit subscriptions still report them. Alternative order is significant: moving distinct wrapper
  scripts or iframes can change fallback priority and must report a new snapshot.
- `stop()` disconnects the mutation and performance observers, drops listeners and
  remembered resources, and cancels queued reporting. Later subscriptions are inert.
  Unsubscribe removes only that subscription; the owner must stop the observation
  when its document is no longer needed. Create a new observation after navigation.

The real popup's **Refresh** sends `popup-refresh` through the exact-popup sender
guard. The worker sends `report` only to authenticated live ports for the requested
tab. Content resubscribes without recreating the observation, document activation
or retention state. Each report starts fresh metadata transport; generation checks
discard superseded responses. No reload, media request or native save is involved.

The module has no runtime entrypoint, Chrome messaging, frame identity, aggregation,
fetching, permissions, or popup integration. Metadata transport is independent.

## Offline proof

Run `mise exec -- env OBSERVER_PROOF_DIR=artifacts/observer node --test test/observe.test.mjs`.
The test bundles the actual module and runs it in Chromium at intercepted URLs.
It checks initial/buffered and late config discovery, query preservation, duplicate
suppression, ordered priority changes, script text/iframe edits, unsubscribe,
queued-stop cancellation, observer disconnection, and hostile-origin refusal before
DOM queries. Every browser request is intercepted; no live Vimeo or media is used.
All `waitForFunction` predicates are synchronous. Chromium closes in `finally`.
`results.json` and `trace.zip` are retained under the selected proof directory.
`observe-interleaving.json` and `references-interleaving.json` record real-DOM
subscription-before-mutation-delivery and subscription-before-queued-scan cases.
They also prove coalesced automatic delivery, independent registrations of one
callback, unsubscribe and pending-scan cancellation on stop. These replace the
weaker fresh-subscriber-only assertion.
These owned examples prove observer behavior, not compatibility with live Vimeo.
