---
opened: 2026-10-27
---

# F016 · Vimeo pages expose config and fallback candidates

## Outcome

A page-discovery API extracts usable inline Vimeo configuration and ordered player-config candidates without fetching anything. It handles more than one script shape and preserves a fallback when inline data is unusable. Repeated discovery sees later configuration instead of pinning the first page snapshot.

## Scope

- Start with a pure discovery module alongside the shared config normaliser, using owned Vimeo-page and player-frame HTML fixtures.
- Recognise inline player JSON/JSON assignments, page-config wrappers with config_url, and supported Vimeo video/embed URL fallbacks.
- Include newly inserted scripts/iframes and supplied observed config-resource URLs when discovery is rerun; deduplicate candidates without stripping unlisted h or explicit query data.
- Keep the callable contract suitable for later Vimeo-only frame observation and fetch-broker integration.

## Out of scope

- Network requests, live Vimeo compatibility claims, frame subscriptions/aggregation, permissions, and popup changes.
- Script evaluation, fetch/XHR monkey patches, arbitrary resource URLs, manifest parsing, and media downloads.

## Acceptance

- Owned page/player fixtures yield their config-derived video metadata and ordered recognised config candidates, not fixture constants.
- Malformed or manifest-less inline data cannot hide a usable later config or explicit/derived player-config fallback.
- Unlisted parameters and supplied config query data survive; duplicate candidates and hostile non-Vimeo URLs do not become new usable sources.
- Real Chromium DOM proof finds late-inserted configuration on rescan and handles quotes/braces inside JSON strings without executing page code.
- The existing runtime remains functional; pnpm verify passes before push and the small M2 Detection draft starts from latest main.
- Verify extension and CodeQL are observed separately from local proof; pending checks are never reported as passed.
