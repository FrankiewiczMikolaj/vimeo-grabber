---
opened: 2026-10-27
landed: 2026-10-27
---
# F021 · The popup shows qualities from live Vimeo frames

## Outcome

Opening the extension on a Vimeo page or an unrelated page containing Vimeo players shows discovered videos, qualities and separate audio metadata. The user can grant only an encountered CDN origin for metadata; this detection-only UI has no download control or media access.

## Scope

- Compose the merged observer, resolver and document-state core into actual ISOLATED all-frame content reporting and a service worker.
- Establish authenticated live document connections before publishing, clear navigation/removal state, and rebuild current reports after worker restart without new broad permissions or persistent URLs.
- Render video titles, statuses, video/audio/combined qualities and unknown fields as safe English text; preserve the legal footer.
- Request exact encountered CDN origins only from a real popup gesture; show denial/revocation honestly and refresh resolution after grant changes.
- Remove obsolete synthetic detector/download code, permission, fixtures and coverage. Replace the superseded M1 save smoke with a basic real-action detection smoke in this same cutover.
- Keep typed discovery admission compatible with the normaliser: an unsupported HTTPS manifest alternative must not discard a valid later fallback; bounded transport still rejects every unapproved fetch host.

## Out of scope

- Real media/segments/keys/licenses, ffmpeg or download implementation, unrelated-site injection and broad grants.
- Full scenario-matrix e2e expansion and claims of live Vimeo compatibility from fixtures alone.

## Acceptance

- The actual built extension reports a Vimeo child frame under an unrelated top page and shows its exact supplied video/audio metadata through the real Chromium action popup.
- Unrelated frames, forged envelopes, removed/navigated documents and stale resolution cannot populate another tab's popup.
- Only player-config access is required; CDN access is optional and requested as an encountered exact origin on click, never the wildcard declaration.
- Safe text rendering, pending/empty/error/permission/protected/unsupported states and the rights footer remain usable; no synthetic or real download action/API remains.
- Owned offline proof reaches a valid fallback after an unsupported alternative without requesting the unsupported host or any media.
- Actual local pnpm verify, including the replacement smoke, passes before every push; the small M2 Detection draft has both required checks inspected and retained visual evidence.
