# Vimeo Grabber

A Vimeo-only Chromium Manifest V3 extension. The English popup lists discovered
Vimeo videos, video/audio/combined qualities, and unknown metadata from matching
live frames, including players embedded on other sites. Each supported quality has
one download button for separate video and matching audio; Audio only saves one file.

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
packages. The smoke retains actual action-popup screenshots and removes its browser
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
after changes. Reload existing Vimeo pages after installation. Detection runs only
on HTTPS `vimeo.com`, `www.vimeo.com`, and `player.vimeo.com` frames, including
matching child frames under unrelated sites. The extension requires
`https://player.vimeo.com/*` for player-config metadata. When discovered metadata
needs CDN access, the popup can request that exact encountered HTTPS origin on
`vimeocdn.com` after you click its permission button. Denying access leaves the
video visible without those qualities. Revoking access refreshes detection.
The `downloads` permission observes native completion and actual saved paths.
No `activeTab`, `tabs`, scripting, or broad site permission is used.
Signed config and manifest URLs stay in memory and are not displayed or stored.
See [the download boundary and limits](docs/M3-DOWNLOAD.md).

Each playback candidate keeps its own source, qualities and permission state.
Usable HLS does not hide an extra DASH origin request. A resolved DASH candidate
with separate video and audio is preferred; HLS and other alternatives stay visible.

Keep the dedicated download tab open; closing the popup does not stop it. Clear
fragmented MP4 with explicit ordered resources or finite HLS playlists is supported.
Encrypted, combined, live, byte-range and unknown forms are rejected. Files remain
separate. Completed paths are shown only after native completion; a failed companion
does not remove the completed file. Linux command formatting follows in issue #43.

## v0.3.0 known limits

The released v0.3.0 can hide DASH after HLS succeeds; this checkout fixes that
with [independent candidates](https://github.com/FrankiewiczMikolaj/vimeo-grabber/issues/41).
The one-time install notice is missing ([M3 issue](https://github.com/FrankiewiczMikolaj/vimeo-grabber/issues/44));
the popup rights/own-risk footer remains visible.

## Legal

Only download content you have rights to. You install and use this project at
your own risk. The author and contributors are not liable. Distribution is planned
through GitHub Releases, not browser stores.

Licensed under the [MIT License](LICENSE).
