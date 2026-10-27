# Scaffold seams

- `vite.config.ts` owns the MV3 manifest; CRXJS bundles `popup.html` and its TypeScript/CSS entry. No background worker or permissions are needed.
- `test/manifest.test.mjs` checks built privilege and popup boundaries. `scripts/smoke.mjs` discovers the unpacked extension in Chromium's extensions page, opens its real popup URL, and saves a screenshot. Broader browser coverage belongs to the browser slice.
- `pnpm verify` builds before the manifest and browser checks. The smoke removes its profile even on failure.
- Tool versions are pinned in `mise.toml` and `package.json`. Use `mise exec -- pnpm …` when pnpm is not selected in the shell.
- No outside scratch directories are used. Retained review evidence is copied to `/home/agent/projects/vimeo-grabber/.limen/jobs/2026-10-27-f001-buildable-extension-shell-a0ebd33f/evidence/`; local generated output stays in ignored `artifacts/` and `dist/`.
