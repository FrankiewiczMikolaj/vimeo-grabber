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
- **PR metadata:** every M0 PR and issue uses milestone `M0 Foundation`; all PRs stay draft for Mikołaj's review.

## Repository setup

- Mikołaj configured main deletion/force-push protection and linear history; PR-required and required status-check configuration remain owner tasks.
- Milestones M0–M5 and Backlog v1.1+ exist; the public Project auto-adds open issues and PRs, so make no Projects or Administration API calls.
- Observed successful checks: `Verify extension` (PR #3 run 40480741113) and `CodeQL JavaScript/TypeScript` (PR #7 run 40482301541, including completed results upload).

## TRACK

- M0 Foundation (v0.1.0): scaffold Vite/CRXJS/TS/pnpm, CI + PR zip artifacts, Playwright Chromium harness, GitHub hygiene stubs, MIT LICENSE — small draft PRs only.

## NOW

<!-- Generated from spec/features/active/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

## NEXT

- Mikołaj reviews the MIT license draft (PR #6) and CodeQL/Dependabot draft (PR #7); all worker implementation slices have finished.
- Confirm default-branch security activation and owner secret-scanning/push-protection settings after the security draft merges.
- Run merged-main M0 checks after the remaining human merges; keep browser proof before M1 and defer v0.1.0 until M0 closes.

## PROVEN

<!-- Generated from spec/features/done/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F006-code-and-dependencies-receive-security-checks` (🟢 PROVEN): Code and dependencies receive security checks; landed 2026-10-27
- `F005-the-project-ships-an-mit-license` (🟢 PROVEN): The project ships an MIT license; landed 2026-10-27
- `F004-contributors-have-clear-github-entry-points` (🟢 PROVEN): Contributors have clear GitHub entry points; landed 2026-10-27
- `F003-chromium-harness-proves-the-unpacked-extension` (🟢 PROVEN): Chromium harness proves the unpacked extension; landed 2026-10-27
- `F002-pull-requests-produce-verified-extension-zip-artifacts` (🟢 PROVEN): Pull requests produce verified extension zip artifacts; landed 2026-10-27
- `F001-vite-builds-a-chromium-extension-shell` (🟢 PROVEN): Vite builds a Chromium extension shell; landed 2026-10-27
- 2026-10: 6 landed. spec/features/done/2026-10/

## PARKED

- (none)

## DROPPED

- (none)
