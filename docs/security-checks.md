# Security checks

## Code analysis

The `CodeQL` workflow runs on pull requests targeting `main`, pushes to `main`,
and Tuesdays at 07:23 UTC. Its job is `CodeQL JavaScript/TypeScript`.
It analyzes JavaScript and TypeScript with CodeQL v4 and `build-mode: none`.
It does not install dependencies or build the extension.

The workflow grants read access to repository contents. Only the analysis job
receives `security-events: write` to upload code-scanning results. It does not
use `pull_request_target` or execute package scripts from a pull request.
GitHub controls token permissions for fork pull requests.

Inspect **Actions → CodeQL** for run results and **Security → Code scanning**
for alerts. The workflow is on `main`; confirm in repository settings that advanced
setup is active and default CodeQL setup is not also running. Scheduled workflows
run from the default branch. A local configuration check does not prove that
GitHub accepted an analysis upload.

## Dependency updates

Dependabot uses the `npm` ecosystem for `package.json` and `pnpm-lock.yaml`,
and `github-actions` for workflow action references. Both check the repository
root weekly on Tuesdays at 08:00 UTC, with at most five open routine version
update PRs per ecosystem. This limit does not cap security update PRs.
The configuration becomes active on the default branch.

Review update PRs and their checks before merging. No automatic merge is set
up here. Dependency alerts and security updates are separate GitHub settings;
this file does not assert that either is enabled.

## Manual secret-scanning and push-protection checks

An owner with access to repository security settings must check these in the
GitHub web UI. This repository configuration does not enable or prove them.

1. Open **Settings → Security → Advanced Security**. Depending on the GitHub UI
   version, this page may be named **Code security** or **Code security and analysis**.
2. Find **Secret Protection → Secret scanning** (or **Secret scanning**).
   Record whether it is enabled, disabled, or unavailable. If available and
   disabled, enable it only with owner approval.
3. Find **Push protection** in the same section. Record its state separately;
   secret scanning alone does not prove push protection is active. If available
   and disabled, enable it only with owner approval.
4. Open **Security → Secret scanning** and inspect access and existing alerts.
   An empty alert list does not prove push protection is active. Do not commit
   a real or test credential to test the setting.
5. Record the check date and observed settings in the PR or owner handoff. If
   access or plan restrictions hide a setting, report that limit instead of
   claiming success. Never include tokens or secret values in the evidence.

See GitHub's [secret-scanning setup guide](https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-secret-scanning-for-your-repository)
and [repository push-protection guide](https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-push-protection-for-your-repository).
