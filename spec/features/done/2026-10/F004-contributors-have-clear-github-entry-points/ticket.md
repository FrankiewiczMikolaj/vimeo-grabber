---
opened: 2026-10-27
landed: 2026-10-27
---

# F004 · Contributors have clear GitHub entry points

## Outcome

Contributors can report bugs, request Vimeo-only features, and submit reviewable pull requests through clear English templates. The owner has a concise list of remaining manual repository settings.

## Scope

- Start with GitHub issue forms, a pull request template, and CODEOWNERS naming the repository owner.
- Document manual settings and stable check names only where observed.
- Record that the owner configured main deletion/force-push protection and linear history, created milestones, and enabled public Project auto-add.

## Out of scope

- GitHub Administration or Projects API calls.
- CI, security workflows, license text, release automation, and additional product features.

## Acceptance

- Issue forms are valid YAML and request actionable reproduction or scope information.
- The PR template asks for pnpm verify evidence and scope without promising CI results.
- CODEOWNERS routes ownership to @FrankiewiczMikolaj.
- Documentation distinguishes completed settings from pending PR-required/check requirements and secret-scanning verification.
- Local pnpm verify passes before push; the draft PR has milestone M0 Foundation.
