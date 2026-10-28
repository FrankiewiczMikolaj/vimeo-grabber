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
The toolbar badge shows the tab's unique Vimeo video count, without opening the
popup. Multiple CDNs, frames and captures of the same video count once. Zero
videos leaves no badge. Navigation clears the previous document's count.
The `downloads` permission observes native completion and actual saved paths.
No `activeTab`, `tabs`, scripting, or broad site permission is used.
The `storage` permission saves only `{ rightsAcknowledged: true }` locally in
the browser profile. It does not save video URLs, browsing history or media.
On first use, read the rights notice and select **I understand and acknowledge**.
The notice stays visible if saving fails; retry the button. A saved acknowledgement
survives popup closure, browser restart and extension updates. A new profile or
cleared extension storage shows the notice again. The footer remains independent.
Signed config and manifest URLs stay in memory and are not displayed or stored.
See [the download boundary and limits](docs/M3-DOWNLOAD.md).

Each playback candidate keeps its own source, qualities and permission state.
Usable HLS does not hide an extra DASH origin request. A resolved DASH candidate
with separate video and audio is preferred; HLS and other alternatives stay visible.

Keep the dedicated download tab open; closing the popup does not stop it. Clear
fragmented MP4 with explicit ordered resources or finite HLS playlists is supported.
Encrypted, combined, live, byte-range and unknown forms are rejected. Files remain
separate. Completed paths are shown only after native completion; a failed companion
does not remove the completed file.
After both files complete, use **Copy command** in the download tab. In Linux
bash/zsh, check `ffmpeg -version` first; on Debian/Ubuntu install it with
`sudo apt install ffmpeg` if needed. Paste the command into your terminal.
It uses the actual absolute saved paths, including native uniqueness suffixes,
and copies video/audio codecs into a `.merged.mp4` beside the video. It never
overwrites existing output (`-n`) or removes source files. If copying fails,
select the displayed command manually. No command appears for Audio only or
incomplete pairs. Title names retain quality/role/format suffixes; unsafe path
characters are removed and long UTF-8 titles are bounded, with `vimeo-ID` fallback.

Assembly uses temporary disk-backed storage, at most 4 GiB per file, 10,000 ordered
resources, 1 MiB of initialization or playlist data and 64 MiB per media segment.
There is no per-read limit. At most five segment requests run together, with
320 MiB of disk-backed lookahead; media is written in source order after init.
Transient network failures retry three times after the initial attempt with
200/400/600 ms backoff. Thirty seconds without progress fails the track.
Quota, permission, cancellation and protection failures are not retried.
One download page owns assembly at a time; the next owner removes orphan data.

## v0.3.0 known limits

The released v0.3.0 can hide DASH after HLS succeeds; this checkout fixes that
with [independent candidates](https://github.com/FrankiewiczMikolaj/vimeo-grabber/issues/41).
The released v0.3.0 has no one-time notice; this checkout adds the
[first-use acknowledgement](https://github.com/FrankiewiczMikolaj/vimeo-grabber/issues/44).

## Legal

You alone are responsible for having rights to any content you download.
You install and use this project at your own risk. The author and contributors
are not liable. Distribution is planned through GitHub Releases, not browser stores.

Licensed under the [MIT License](LICENSE).
