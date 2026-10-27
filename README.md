# Vimeo Grabber

A Vimeo-only Chromium Manifest V3 extension. The English popup lists one explicitly
synthetic fixture stream and saves its plain-text dummy file. Real Vimeo video
extraction and downloads are not implemented.

## Linux development

Use Node.js 24 and pnpm 10.34.8 (versions also recorded in `mise.toml`). With mise,
run `mise trust` and `mise install`, then use `mise exec --` before the commands
below if the tools are not on your PATH.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`verify` runs ESLint, TypeScript, a production build, Node unit checks of the
built extension's permission and popup boundaries, then an unpacked Chromium
smoke. It does not contact Vimeo. Run it before every push.

The smoke uses Playwright **1.64.1**, `channel: 'chromium'`, and the installed
Chromium browser. On a new Linux developer machine, provision the browser with
`pnpm exec playwright install chromium`; this project does not install system
packages. The smoke saves `artifacts/headless/popup.png` and removes its browser
profile. See [the harness entry and limits](docs/browser-harness.md).

- `pnpm dev`: Vite development server.
- `pnpm build`: production extension in `dist/`.
- `pnpm lint`, `pnpm typecheck`: static checks.
- `pnpm unit`: manifest contract checks; run `pnpm build` first.
- `pnpm smoke`: installed-browser check; run `pnpm build` first.

## Load the extension

Run `pnpm build`. Open `chrome://extensions`, enable Developer mode, select
**Load unpacked**, and choose this checkout's `dist/` directory. Pin Vimeo Grabber
and click its toolbar icon to open the popup. Rebuild and reload the extension
after changes. The extension requests `downloads` and runs a bundled detector only
on HTTPS `vimeo.com`, `www.vimeo.com`, and `player.vimeo.com` pages. It needs no
`activeTab`, `tabs`, scripting, or broad host permission. It makes no network
requests. See [the fixture contract](docs/fixture-detection.md).

## Legal

Only download content you have rights to. You install and use this project at
your own risk. The author and contributors are not liable. The synthetic fixture
downloads plain text only. Distribution is planned through GitHub Releases,
not browser stores.

Licensed under the [MIT License](LICENSE).
