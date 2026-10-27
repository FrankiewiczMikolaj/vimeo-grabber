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

- Mikołaj accepts M2 for v0.3.0 after Bob's live page/embed HLS validation; independent DASH resolution and the missing one-time notice move to M3.
- M1 is owner-closed; v0.2.0 is a GitHub pre-release at 90b88f2 and milestone M1 Walking skeleton is closed.
- M0 is owner-closed; Bob published v0.1.0 as a GitHub pre-release at cdc458a, and milestone M0 Foundation is closed.

## NOW

<!-- Generated from spec/features/active/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

## NEXT

- After Mikołaj merges the 0.3.0 version PR, tag that exact commit as a GitHub pre-release and close milestone M2 Detection.
- M3 starts with independent DASH/HLS candidates, per-origin permissions and preference for separate DASH tracks (issue #41).
- Add explicit download URL/reference fields to the Track contract before downloads (issue #42).
- Save selected video and audio as separate real files without extension-side mux (issue #45), then provide the safe Linux ffmpeg command (issue #43).
- Implement the missing one-time install disclaimer while retaining the footer (issue #44).
- No M3 worker starts until Mikołaj authorises it; Codex-only route, draft PRs and owner-only merges still apply.

## PROVEN

<!-- Generated from spec/features/done/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F022-chromium-proves-cross-frame-detection-without-media-downloads` (🟢 PROVEN): Chromium proves cross-frame detection without media downloads; landed 2026-10-27
- `F021-the-popup-shows-qualities-from-live-vimeo-frames` (🟢 PROVEN): The popup shows qualities from live Vimeo frames; landed 2026-10-27
- `F020-frame-discoveries-stay-scoped-to-their-live-tab-documents` (🟢 PROVEN): Frame discoveries stay scoped to their live tab documents; landed 2026-10-27
- `F019-discovered-vimeo-configs-resolve-to-track-qualities` (🟢 PROVEN): Discovered Vimeo configs resolve to track qualities; landed 2026-10-27
- `F018-vimeo-metadata-fetching-stays-within-approved-hosts` (🟢 PROVEN): Vimeo metadata fetching stays within approved hosts; landed 2026-10-27
- `F017-vimeo-frames-publish-fresh-discovery-snapshots` (🟢 PROVEN): Vimeo frames publish fresh discovery snapshots; landed 2026-10-27
- `F016-vimeo-pages-expose-config-and-fallback-candidates` (🟢 PROVEN): Vimeo pages expose config and fallback candidates; landed 2026-10-27
- `F015-dash-mpd-representations-retain-inherited-track-metadata` (🟢 PROVEN): DASH MPD representations retain inherited track metadata; landed 2026-10-27
- `F014-hls-playlists-expose-variants-and-audio-groups` (🟢 PROVEN): HLS playlists expose variants and audio groups; landed 2026-10-27
- `F013-dash-manifests-expose-separate-video-and-audio-tracks` (🟢 PROVEN): DASH manifests expose separate video and audio tracks; landed 2026-10-27
- 2026-10: 22 landed. spec/features/done/2026-10/

## PARKED

- (none)

## DROPPED

- (none)
