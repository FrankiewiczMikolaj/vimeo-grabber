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

- Mikołaj configured main deletion/force-push protection and linear history; PR-required and required status checks remain pending CI check names.
- Milestones M0–M5 and Backlog v1.1+ exist; the public Project auto-adds open issues and PRs, so make no Projects or Administration API calls.

## TRACK

- M0 Foundation (v0.1.0): scaffold Vite/CRXJS/TS/pnpm, CI + PR zip artifacts, Playwright Chromium harness, GitHub hygiene stubs, MIT LICENSE — small draft PRs only.

## NOW

<!-- Generated from spec/features/active/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F003-chromium-harness-proves-the-unpacked-extension` (🟠 ACTIVE): Chromium harness proves the unpacked extension
- `F002-pull-requests-produce-verified-extension-zip-artifacts` (🟠 ACTIVE): Pull requests produce verified extension zip artifacts

## NEXT

- Run CI/artifact and browser harness as independent slices; CI retains `pnpm verify`, browser retains `pnpm smoke`, and neither edits the other's files.
- Follow with GitHub hygiene, MIT license, and CodeQL/Dependabot drafts as the two worker slots open.
- Keep browser proof before M1; tag v0.1.0 only after M0 checks and human merges finish.

## PROVEN

<!-- Generated from spec/features/done/ by limen land, limen ticket done and limen board --write. Edit the tickets, not these lines. -->

- `F001-vite-builds-a-chromium-extension-shell` (🟢 PROVEN): Vite builds a Chromium extension shell; landed 2026-10-27
- 2026-10: 1 landed. spec/features/done/2026-10/

## PARKED

- (none)

## DROPPED

- (none)
