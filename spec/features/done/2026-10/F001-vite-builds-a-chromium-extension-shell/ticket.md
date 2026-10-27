---
opened: 2026-10-27
landed: 2026-10-27
---

# F001 · Vite builds a Chromium extension shell

## Outcome

Contributors can install, check, and build a minimal Vimeo Grabber Chromium MV3 extension from a fresh checkout. The English popup identifies the project without claiming detection or downloads work. This is the first M0 draft PR, establishing the build seam for the later browser and CI slices.

## Scope

- Start at the package manifest: TypeScript, Vite, CRXJS, and pnpm with a committed lockfile.
- Provide a minimal popup and MV3 manifest with no unnecessary permissions or external network access.
- Establish local lint, typecheck, unit, build, and minimal unpacked-extension smoke commands behind `pnpm verify`.
- Include only the bootstrap Chromium smoke needed to meet the pre-push policy; the dedicated browser slice owns the fuller Playwright harness.
- Document Linux setup, commands, and loading the built extension in a concise README.

## Out of scope

- Video detection, downloads, shell commands, and placeholder module implementations.
- CI workflows, release automation, GitHub templates, and the separate MIT license slice.
- Full browser fixture coverage, store publication, and other video platforms.

## Acceptance

- A fresh checkout installs with `pnpm install --frozen-lockfile`.
- `pnpm build` produces a loadable MV3 extension with an English popup.
- `pnpm verify` runs real lint, typecheck, unit checks, and an unpacked-extension Chromium smoke successfully before any push.
- Chromium loads the built extension and its popup is visually checked; use Playwright 1.64.1 with `channel: 'chromium'` and the installed browser, without system package installation.
- A draft PR targets main with title `chore: scaffold Vite CRXJS TS pnpm`, reports exact checks, and remains unmerged.

## Notes

Keep the handwritten diff near 300 lines; report lockfile size separately. Use the board's default worker route and human review ownership. No independent reviewer lane. Notify the coordinator if a tool dependency is unavailable; do not bypass checks or substitute a model.
