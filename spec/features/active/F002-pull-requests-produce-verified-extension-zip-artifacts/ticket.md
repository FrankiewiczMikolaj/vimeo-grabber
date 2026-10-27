---
opened: 2026-10-27
---

# F002 · Pull requests produce verified extension zip artifacts

## Outcome

Contributors see whether a pull request passes the local quality checks and can download its built extension zip. M0 gains a reproducible CI artifact, not a release publication.

## Scope

- Start at a GitHub Actions workflow using the existing pnpm verify command.
- Run on pull requests and main changes with least-privilege permissions.
- Use the locked toolchain and provision the matching Playwright Chromium on the Linux runner.
- Package the built extension with manifest.json at the zip root and upload a PR artifact.

## Out of scope

- Browser harness implementation and security scanning workflows.
- Releases, attestations, tags, store publication, and repository administration.

## Acceptance

- Local pnpm verify passes before every push.
- Workflow validation succeeds and the same Linux build/package commands produce a zip that opens with manifest.json at its root.
- A pull-request Actions run passes all verify stages and exposes a downloadable extension zip; if Actions access blocks observation, report the exact limit rather than claim success.
- The draft PR targets main, has milestone M0 Foundation, and documents stable check names for later required-check configuration.
