# Pure page discovery

`src/detect/discover.ts` exports `discoverPage(document, frameUrl, observedConfigUrls = [])`.
It returns `{ videos, configUrls }`. It does not fetch, evaluate page scripts, install
observers, inspect another frame's document, or change the existing runtime.

## Supported data and ordering

- Scan scripts in DOM order. Decode `application/json` directly, or JSON object
  assignments to `playerConfig` (bare, window, var/let/const) and
  `vimeo.clip_page_config` (bare or window). Assignments start at the script start
  or after a semicolon/newline. This is a bounded supported envelope, not a JavaScript
  interpreter: expressions, JSON.parse calls, comments inside JSON and arbitrary
  globals are unsupported. Balance braces outside JSON strings, including escapes.
- Pass each decoded root to the existing, unchanged `normalisePlayerConfig`.
  `videos` keeps config-derived identity, title, manifests and status in script
  order, with caller-supplied `frameUrl` and null `configUrl`. Deduplicate identical
  normalised results only; two configs with the same video ID but different
  metadata/manifests remain alternatives. Manifest-less results remain unavailable,
  never suppressing later configs or URLs. No first-result cache exists.
- `configUrls` first contains each wrapper's `player.config_url` in script order,
  then supplied observed resource URLs in input order, then derived URLs from the
  current frame and iframe `src` attributes in DOM order. Deduplicate identical
  resolved URLs, not video IDs or queries. Fetch scheduling/identity aggregation
  belongs to the worker runtime; an unavailable inline result is not terminal.
- Explicit config endpoints must resolve to HTTPS `player.vimeo.com/video/ID/config`.
  Derived endpoints accept HTTPS `player.vimeo.com/video/ID`, `vimeo.com/ID`,
  `www.vimeo.com/ID`, and public `/ID/unlistedHash` paths, with optional trailing
  slash. IDs are nonzero decimal strings. Reject credentials, nonstandard ports,
  other hosts and other paths. Resolve relative references against `frameUrl`,
  not a page-controlled base element. Drop fragments; keep explicit query bytes,
  repeated keys and empty values. Copy the full video/embed query to a derived
  endpoint; append a path's unlisted hash as `h` only if the query has no `h`.

## Proof and limits

Run `node --test test/discover.test.mjs`. It builds the actual module in memory and
uses offline Chromium DOMParser documents plus late insertion in a real document.
Owned `discovery-*.html` fixtures cover malformed-first JSON, page wrappers,
manifest-less then usable assignment data, and quoted braces/backslashes. Assertions
cover output values, ordered query-preserving fallbacks, hostile URLs, duplicate
and distinct alternatives, and later scripts/iframes/observed URLs on rescan.
Fixture page scripts remain inert; all browser requests are aborted. Set
`DISCOVERY_PROOF_DIR=artifacts/discovery` to retain results, a rendered result image,
and a trace. The test closes Chromium. These authored fixtures do not establish
live Vimeo compatibility, fetch authorisation, subscriptions or playable media.
