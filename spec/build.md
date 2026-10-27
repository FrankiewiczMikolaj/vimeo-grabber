# Build

> Coordinator-maintained narrative board. TRACK, NEXT, PARKED and DROPPED are coordinator prose: keep them true in the change that moves feature state. NOW and PROVEN are generated from the feature lanes by `limen land`, `limen ticket done` and `limen board --write`; edit the tickets, not those lines.

TRACK at most three bullets. NEXT one clause per ticket. PROVEN names the last ten landed features, then one count line per month.

Status marks are prose only: 🟠 ACTIVE · 🔴 PLANNED · 🟢 PROVEN · ⚪ DROPPED. Nothing in `limen` treats them as workflow state.

## Models (owner policy)

Durable choices. Pass these flags explicitly on every spawn/continue. Full text: `docs/MODEL-POLICY.md`.

- **Engine:** omp
- **Provider:** openai-codex (only provider; never auto-switch)
- **Coordinator / default worker / review:** gpt-6.1-sol, thinking medium
- **Simple-ticket workers (optional):** gpt-5.6-luna, thinking high — only when the ticket is marked simple
- **Coordinator behaviour:** request a role only; do not pick or escalate models
- **Quota:** on Codex limit, park and `notify-bob "…" blocker`; never use saved resets; never switch provider
- **Review ownership:** Mikołaj reviews and merges personally; do not open an independent reviewer lane unless asked
- **Max workers:** 2
- **Timeout:** 90m default unless a ticket says otherwise
- **PR metadata:** every M2 PR and issue uses milestone `M2 Detection` (3); all PRs stay draft for Mikołaj's review.

## Repository setup

- Mikołaj configured main protection; `Verify extension` and CodeQL must run on every PR, including planning and documentation drafts.
- Milestones M0–M5 and Backlog v1.1+ exist; the public Project auto-adds open issues and PRs, so make no Projects or Administration API calls.
- Observed successful checks: `Verify extension` (PR #3 run 40480741113) and `CodeQL JavaScript/TypeScript` (PR #7 run 40482301541, including completed results upload).
- Dependabot PRs #9–#12 belong to Mikołaj; do not edit, update, close, merge, or otherwise manage them.

## TRACK

- M2 Detection targets v0.3.0: real Vimeo videos and popup qualities through multiple config paths and DASH/HLS metadata; no real media downloads.
- M1 is owner-closed; v0.2.0 is a GitHub pre-release at 90b88f2 and milestone M1 Walking skeleton is closed.
- M0 is owner-closed; Bob published v0.1.0 as a GitHub pre-release at cdc458a, and milestone M0 Foundation is closed.

## NOW

<!-- Generated from spec/features/active/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F016-vimeo-pages-expose-config-and-fallback-candidates` (🟠 ACTIVE): Vimeo pages expose config and fallback candidates
- `F011-real-vimeo-videos-expose-their-video-and-audio-qualities` (🟠 ACTIVE): Real Vimeo videos expose their video and audio qualities

## NEXT

- HLS is owner-merged; standard MPD draft PR #28 has passed both checks and awaits human review.
- DASH JSON draft PR #27 remains under a focused smoke-completion repair; preserve strict native download assertions.
- Run pure multi-path config discovery on disjoint files while the smoke repair finishes; no runtime, permission or download cutover in that slice.
- Continue with fetch/frame runtime, popup cutover and offline e2e under docs/M2-DETECTION.md, max two workers and both required checks.
- Keep Vimeo-only frame access, offline CI and metadata-only fetching; real media downloading remains M3.

## PROVEN

<!-- Generated from spec/features/done/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F015-dash-mpd-representations-retain-inherited-track-metadata` (🟢 PROVEN): DASH MPD representations retain inherited track metadata; landed 2026-10-27
- `F014-hls-playlists-expose-variants-and-audio-groups` (🟢 PROVEN): HLS playlists expose variants and audio groups; landed 2026-10-27
- `F013-dash-manifests-expose-separate-video-and-audio-tracks` (🟢 PROVEN): DASH manifests expose separate video and audio tracks; landed 2026-10-27
- `F012-vimeo-configs-normalise-into-a-shared-detection-model` (🟢 PROVEN): Vimeo configs normalise into a shared detection model; landed 2026-10-27
- `F010-chromium-proves-the-fixture-download-end-to-end` (🟢 PROVEN): Chromium proves the fixture download end to end; landed 2026-10-27
- `F009-the-popup-lists-and-downloads-a-fixture-stream` (🟢 PROVEN): The popup lists and downloads a fixture stream; landed 2026-10-27
- `F008-chromium-exercises-the-extension-toolbar-action` (🟢 PROVEN): Chromium exercises the extension toolbar action; landed 2026-10-27
- `F007-a-synthetic-vimeo-page-exposes-one-detectable-stream` (🟢 PROVEN): A synthetic Vimeo page exposes one detectable stream; landed 2026-10-27
- `F006-code-and-dependencies-receive-security-checks` (🟢 PROVEN): Code and dependencies receive security checks; landed 2026-10-27
- `F005-the-project-ships-an-mit-license` (🟢 PROVEN): The project ships an MIT license; landed 2026-10-27
- 2026-10: 14 landed. spec/features/done/2026-10/

## PARKED

- (none)

## DROPPED

- (none)
