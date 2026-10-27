---
opened: 2026-10-27
landed: 2026-10-27
---

# F006 · Code and dependencies receive security checks

## Outcome

The repository gains code analysis and dependency update automation. The owner can see which remaining secret-scanning settings require manual confirmation.

## Scope

- Start at separate CodeQL and Dependabot configuration files.
- Analyze JavaScript/TypeScript on pull requests, main, and a schedule with least-privilege permissions.
- Configure dependency updates for pnpm packages and GitHub Actions.
- Document secret scanning and push protection as owner-managed GitHub settings, not a pretend repository switch.

## Out of scope

- Administration API calls, custom secret scanners, and secrets in fixtures.
- Main CI/artifact workflow, product functionality, releases, and automatic merges.

## Acceptance

- Configuration validation succeeds and CodeQL targets JavaScript/TypeScript without unnecessary compilation.
- Dependabot covers the repository package manager and Actions with a bounded routine update schedule.
- A CodeQL Actions run is inspected when accessible; report permission limits separately from successful local validation.
- Documentation gives the owner exact manual secret-scanning/push-protection checks without claiming they are enabled.
- pnpm verify passes before push; the draft PR targets main with milestone M0 Foundation.
