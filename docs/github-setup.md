# GitHub contributor setup

The issue chooser offers a bug report and a Vimeo-only feature request in English.
The PR template asks for scope, local `pnpm verify` evidence, and unverified behavior.
`CODEOWNERS` routes all files to `@FrankiewiczMikolaj`; it does not itself require approval.
Templates become the default contributor entry points after they reach `main`.

## Completed by the owner

The owner recorded these settings in the canonical `spec/build.md`:

- `main` has deletion and force-push protection, and requires linear history.
- Milestones M0 through M5 and `Backlog v1.1+` exist.
- The public Project auto-adds open issues and pull requests.

These are owner-reported settings, not an Administration or Projects API audit.
Do not add Project assignment to issue forms or call those APIs for this setup.
Keep M0 PRs draft and assign milestone `M0 Foundation` to each M0 PR and issue.
Only Mikołaj merges.

## Recorded setup limits (2026-10-27)

These are the initial setup observations, not the current protection/check state.
See `spec/build.md` and [the current CI checks](ci.md) for the later owner record.

- Require pull requests before changes reach `main`.
- Select required status checks only after CI has run and stable check names are observed.
  On 2026-10-27, the read-only commit check-runs endpoint for `main` returned zero checks.
  No required check name is established here; `pnpm verify` is a local command, not an observed GitHub check name.
- Manually confirm secret scanning and push protection in the repository's security settings.
  Record whether each is enabled and available for this repository. A committed file cannot enable or prove either setting.

Do not mark the pending rules complete from a successful local run or a workflow file alone.
After CI produces checks, inspect a real PR's Checks tab and record the exact names before the owner selects them.

## Template validation

Issue forms use GitHub's documented [issue form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
and [form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema).
Each form has a unique name, a description, and a body with unique field IDs.
Required responses collect reproduction details or a bounded feature outcome.
No labels, milestones, or Projects are claimed to be assigned by the forms.
