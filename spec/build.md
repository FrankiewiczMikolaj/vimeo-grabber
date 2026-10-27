# Build

> Coordinator-maintained narrative board. TRACK, NEXT, PARKED and DROPPED are coordinator prose: keep them true in the change that moves feature state. NOW and PROVEN are generated from the feature lanes by `limen land`, `limen ticket done` and `limen board --write`; edit the tickets, not those lines.

TRACK at most three bullets. NEXT one clause per ticket. PROVEN names the last ten landed features, then one count line per month.

Status marks are prose only: 🟠 ACTIVE · 🔴 PLANNED · 🟢 PROVEN · ⚪ DROPPED. Nothing in `limen` treats them as workflow state.

## Models (owner policy)

Durable choices. Pass these flags explicitly on every spawn/continue. Full text: `docs/MODEL-POLICY.md`.

- **Engine:** omp
- **Provider:** openai-codex (only provider; never auto-switch)
- **Coordinator / default worker / review:** gpt-6.1-sol, thinking medium
- **M3 workers:** gpt-6.1-sol, thinking medium for every slice; no simple-ticket model substitution
- **Coordinator behaviour:** request a role only; do not pick or escalate models
- **Quota:** on Codex limit, park and `notify-bob "…" blocker`; never use saved resets; never switch provider
- **Review ownership:** Mikołaj reviews and merges personally; do not open an independent reviewer lane unless asked
- **Max workers:** 2
- **Timeout:** 90m default unless a ticket says otherwise
- **PR metadata:** every M3 PR and issue uses milestone `M3 Download` (4); all PRs stay draft for Mikołaj's review.

## Repository setup

- Mikołaj configured main protection; `Verify extension` and CodeQL must run on every PR, including planning and documentation drafts.
- Milestones M0–M5 and Backlog v1.1+ exist; the public Project auto-adds open issues and PRs, so make no Projects or Administration API calls.
- Observed successful checks: `Verify extension` (PR #3 run 40480741113) and `CodeQL JavaScript/TypeScript` (PR #7 run 40482301541, including completed results upload).
- Dependabot PRs #9–#12 belong to Mikołaj; do not edit, update, close, merge, or otherwise manage them.

## TRACK

- M3 plan is owner-merged; Track references are merged, paired downloads are next, then Linux command; notice may run alongside downloads only on disjoint files.
- M2 is owner-closed; v0.3.0 is a GitHub pre-release at c9f2177, with live HLS page/embed evidence and DASH/notice gaps deferred to M3.
- M1 is owner-closed; v0.2.0 is a GitHub pre-release at 90b88f2 and milestone M1 Walking skeleton is closed.

## NOW

<!-- Generated from spec/features/active/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F023-users-download-separate-vimeo-video-and-audio-with-a-safe-merge-command` (🟠 ACTIVE): Users download separate Vimeo video and audio with a safe merge command

## NEXT

- Candidates (#41) are owner-merged; preserve the issue comments on genuine DRM and separate-HLS fallback; Mikołaj chooses a non-DRM live DASH example.
- Track references (#42) are owner-merged in PR #49 at b4ccfb5; F026 prepares one-click quality pairs and Audio only (#45).
- Save exactly two completed files per quality click, one for Audio only, and retain completed files with honest partial-failure state (#45).
- Generate the safely quoted Linux ffmpeg command from actual absolute download paths (#43).
- Hold notice (#44) behind download integration while popup, worker, manifest and browser-harness changes overlap.
- Use offline fixtures as CI truth; request Bob's live checks after candidates and downloads; at most two disjoint workers, fixed Codex Sol medium, no owner-merge bypass.

## PROVEN

<!-- Generated from spec/features/done/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F025-tracks-expose-explicit-download-references-with-ordered-initialization` (🟢 PROVEN): Tracks expose explicit download references with ordered initialization; landed 2026-10-28
- `F024-every-vimeo-playback-candidate-keeps-its-own-result-and-permission-state` (🟢 PROVEN): Every Vimeo playback candidate keeps its own result and permission state; landed 2026-10-27
- `F022-chromium-proves-cross-frame-detection-without-media-downloads` (🟢 PROVEN): Chromium proves cross-frame detection without media downloads; landed 2026-10-27
- `F021-the-popup-shows-qualities-from-live-vimeo-frames` (🟢 PROVEN): The popup shows qualities from live Vimeo frames; landed 2026-10-27
- `F020-frame-discoveries-stay-scoped-to-their-live-tab-documents` (🟢 PROVEN): Frame discoveries stay scoped to their live tab documents; landed 2026-10-27
- `F019-discovered-vimeo-configs-resolve-to-track-qualities` (🟢 PROVEN): Discovered Vimeo configs resolve to track qualities; landed 2026-10-27
- `F018-vimeo-metadata-fetching-stays-within-approved-hosts` (🟢 PROVEN): Vimeo metadata fetching stays within approved hosts; landed 2026-10-27
- `F017-vimeo-frames-publish-fresh-discovery-snapshots` (🟢 PROVEN): Vimeo frames publish fresh discovery snapshots; landed 2026-10-27
- `F016-vimeo-pages-expose-config-and-fallback-candidates` (🟢 PROVEN): Vimeo pages expose config and fallback candidates; landed 2026-10-27
- `F015-dash-mpd-representations-retain-inherited-track-metadata` (🟢 PROVEN): DASH MPD representations retain inherited track metadata; landed 2026-10-27
- 2026-10: 24 landed. spec/features/done/2026-10/

## PARKED

- Bob/Mikołaj paused M3 starts with about 5% Codex 5h left; save preparation only, no jobs, no saved reset or provider switch, resume only on Bob's instruction after the expected 04:15 reset.

## DROPPED

- (none)
