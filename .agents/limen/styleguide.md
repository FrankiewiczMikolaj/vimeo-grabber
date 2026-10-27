# Styleguide

Durable coding practice for this repository. Keep compact and bullet-led.

## Stack and layout

- TypeScript, Vite, CRXJS, pnpm for the MV3 extension.
- Modules: detect / download / UI / shell. No multi-site adapters.
- Conventional Commits. One concern per PR, under ~300 changed lines when practical.
- English identifiers, comments, and UI strings only.

## Quality bar

- Before every push: local `pnpm verify` (lint + typecheck + unit + harness smoke). CI is the final check, not the first.
- Prefer unit tests with fixtures; live Vimeo never gates default CI.
- Quote shell carefully; merge commands use absolute paths and POSIX-safe quoting.
- No secrets in git. No personal emails in commits (use the GitHub noreply identity already configured locally).

## What not to do

- Do not add other video platforms.
- Do not merge to main, force-push, or run `limen land`.
- Do not publish store listings.
- Do not invent product scope beyond vision.md and open tickets.
