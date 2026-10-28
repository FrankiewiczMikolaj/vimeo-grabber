# CI and pull-request extension zips

The `CI` workflow runs on pull requests and pushes to `main` on Ubuntu 24.04.
Its stable check name is **Verify extension** (job key `verify`). Use that check
for required-check configuration after GitHub has observed a successful run.
Keep the job name stable; step names are not separate required checks.

CI uses Node.js 24 and the pnpm version in `package.json`'s `packageManager`.
It installs dependencies with `pnpm install --frozen-lockfile`, then provisions
Chromium and its Linux libraries with `pnpm exec playwright install --with-deps chromium`.
The locked Playwright package selects the matching browser revision.
`pnpm verify` runs lint, typecheck, build, unit tests, and the Chromium smoke check.
Live Vimeo is not required. The workflow has only `contents: read` permission.

## Ready-for-review checks

Before reporting any PR ready, fetch `origin/main` and record its commit. Merge
that revision into the PR branch normally if it is not already an ancestor;
never rebase or force-push. Install the merged lockfile and run `pnpm verify`
before the normal push.

Wait for **Verify extension** and **CodeQL JavaScript/TypeScript** on the final
PR head. Fetch main again before the ready notification. If main advanced,
integrate it and repeat verification and checks. Report the tested main and
PR head with the check results; this applies to documentation drafts too.

The pull-request workflow checks out GitHub's synthetic PR merge, not only the
branch head. That tests the base available when the run starts, not every later
main commit. A green run also does not exclude a timing defect: waits must
observe the exact state transition before asserting the final surface.

## Reproduce packaging on Linux

Run `pnpm verify` first. From the generated `dist/` directory, run the same
commands as CI:

```sh
zip -r ../vimeo-grabber.zip .
unzip -t ../vimeo-grabber.zip
unzip -p ../vimeo-grabber.zip manifest.json > /dev/null
```

Use a fresh output path: remove an older `vimeo-grabber.zip` before packaging
locally so removed build files cannot remain in the archive. CI uses a clean
checkout. `manifest.json` is at the archive root, not under `dist/`.

## Download and install a PR build

After **Verify extension** passes, open the pull request's `CI` run and download
`vimeo-grabber-pr-<PR number>` from **Artifacts**. Artifacts expire after 14 days.
GitHub's artifact download wraps `vimeo-grabber.zip` in another zip; extract the
wrapper first, then extract the extension zip into a directory. In Chromium,
open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and
choose the directory containing `manifest.json`.

Main pushes verify and package the extension but do not upload a PR artifact.
These zips are test builds, not releases, store packages, or attestations.
Fork PRs do not need repository secrets or write permissions. CI intentionally
uses `pull_request`, not `pull_request_target`, to run contributed code.
