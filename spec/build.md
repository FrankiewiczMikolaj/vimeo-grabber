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
- **PR metadata:** every M1 PR and issue uses milestone `M1 Walking skeleton` (2); all PRs stay draft for Mikołaj's review.

## Repository setup

- Mikołaj configured main protection; `Verify extension` and CodeQL must run on every PR, including planning and documentation drafts.
- Milestones M0–M5 and Backlog v1.1+ exist; the public Project auto-adds open issues and PRs, so make no Projects or Administration API calls.
- Observed successful checks: `Verify extension` (PR #3 run 40480741113) and `CodeQL JavaScript/TypeScript` (PR #7 run 40482301541, including completed results upload).
- Dependabot PRs #9–#12 belong to Mikołaj; do not edit, update, close, merge, or otherwise manage them.

## TRACK

- M1 Walking skeleton: owned synthetic Vimeo fixture, typed fixture detection, one popup stream, dummy Downloads API save, and real Chromium end-to-end proof.
- M0 is owner-closed; Bob published v0.1.0 as a GitHub pre-release at cdc458a, and milestone M0 Foundation is closed.

## NOW

<!-- Generated from spec/features/active/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F009-the-popup-lists-and-downloads-a-fixture-stream` (🟠 ACTIVE): The popup lists and downloads a fixture stream

## NEXT

- The synthetic fixture detector and real action-popup harness are owner-merged; wire the popup and real Downloads API dummy save from latest main.
- After popup/download merges, prove the complete fixture download in Chromium through the real action popup where feasible.
- Keep PRs small and draft, preserve both required workflows, and report the actual toolbar entry path without claiming direct popup URL navigation is a click.

## PROVEN

<!-- Generated from spec/features/done/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F008-chromium-exercises-the-extension-toolbar-action` (🟢 PROVEN): Chromium exercises the extension toolbar action; landed 2026-10-27
- `F007-a-synthetic-vimeo-page-exposes-one-detectable-stream` (🟢 PROVEN): A synthetic Vimeo page exposes one detectable stream; landed 2026-10-27
- `F006-code-and-dependencies-receive-security-checks` (🟢 PROVEN): Code and dependencies receive security checks; landed 2026-10-27
- `F005-the-project-ships-an-mit-license` (🟢 PROVEN): The project ships an MIT license; landed 2026-10-27
- `F004-contributors-have-clear-github-entry-points` (🟢 PROVEN): Contributors have clear GitHub entry points; landed 2026-10-27
- `F003-chromium-harness-proves-the-unpacked-extension` (🟢 PROVEN): Chromium harness proves the unpacked extension; landed 2026-10-27
- `F002-pull-requests-produce-verified-extension-zip-artifacts` (🟢 PROVEN): Pull requests produce verified extension zip artifacts; landed 2026-10-27
- `F001-vite-builds-a-chromium-extension-shell` (🟢 PROVEN): Vite builds a Chromium extension shell; landed 2026-10-27
- 2026-10: 8 landed. spec/features/done/2026-10/

## PARKED

- (none)

## DROPPED

- (none)
