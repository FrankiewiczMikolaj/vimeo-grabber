# Vimeo Grabber

A Vimeo-only Chromium Manifest V3 extension. This README describes the **unreleased
M3 checkout**, unless a section explicitly names a published release. English UI;
Linux is the supported download/merge/test platform. No browser-store publication.

## What this checkout does

- Finds Vimeo players and links automatically on other sites, including unlisted
  ID-plus-hash references. The popup shows one card per video, not technical track lists.
- Shows the tab's unique Vimeo video count in the toolbar badge without opening
  the popup. Multiple sources for one video count once; zero leaves no badge.
  Navigation clears the previous document's count.
- Offers supported quality buttons for separate video and matching audio, plus
  **Audio only**. Separate DASH is preferred; usable HLS remains a fallback.
- Saves native files from supported clear fragmented MP4 resources or finite HLS.
  The download tab shows progress, completed paths and honest partial failure.
- Provides **Copy command** after both files complete, for a Linux ffmpeg merge
  without transcoding. The extension does not mux or execute shell commands.
- Shows a first-use rights notice and retains its acknowledgement locally.

## Published release and installation

The latest published release is [v0.3.0, M2 Detection](https://github.com/FrankiewiczMikolaj/vimeo-grabber/releases/tag/v0.3.0).
It lists detection/quality metadata only: **no media downloads or one-time notice**.
Its HLS-first result can hide DASH alternatives. The download features above are
not in that release, even though this checkout still has manifest version 0.3.0.

The v0.3.0 release currently has **no prebuilt extension zip asset**. GitHub's
**Source code (zip)** is source, not a ready-to-load extension:

1. Open that release, download **Source code (zip)** and extract it.
2. Install Node.js 24 and pnpm 10.34.8. In the extracted directory run:
   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   ```
3. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**,
   and choose the generated `dist/` directory, not the source/archive root.
4. Pin Vimeo Grabber to the toolbar. Reload existing Vimeo pages, then open its popup.

For the unreleased checkout, build this checkout using the same commands and load
its `dist/`. For a reviewed PR build, use the extension artifact instructions in
[CI and PR zips](docs/ci.md). A PR artifact is not a published release. Updating an
unpacked installation requires rebuilding/replacing its files and reloading it in
`chrome://extensions`; it is not an automatic signed update.

## Use the unreleased checkout

1. Read the rights notice and select **I understand and acknowledge**. If saving
   fails, the notice stays visible and the button can retry. The footer stays visible.
2. Open a Vimeo page or a page containing a Vimeo player or link. Open the action popup.
3. Choose a supported quality to save separate video and matching audio, or
   **Audio only** for one audio file. Metadata alone is not a successful download;
   an unavailable/protected/unsupported result must not be treated as a usable file.
4. Keep the dedicated download tab open. Admitted downloads continue when the
   popup closes, tabs switch or the source tab closes. Reopen the popup to see
   current segment progress and **Open download** to return to the owner tab.
   Closing the download tab cancels its active work. **Cancel** stops queued/current
   files; **Cancel file** stops only its row. Completed files stay intact.
5. Wait for native completion and the actual saved paths. Use a failed/cancelled
   row's **Retry** to restart that file from initialization with empty temporary
   storage. It never downloads the completed companion again. Incomplete native
   `.crdownload` files are partial, not playable successes or merge inputs.

Chromium uses its download settings and may add filename collision suffixes.
Chrome can show **Save As** when **Ask where to save each file before downloading**
is enabled, despite the extension requesting `saveAs: false`. Each file has its
own native save. Leave the download tab open while either dialog waits; the
30-second network inactivity limit does not apply to native saving.
Video saves use `<Title> - video <quality>.mp4`; audio, including Audio only,
uses `<Title> - audio.m4a`. The safe title stem is limited to 96 UTF-8 bytes,
with `vimeo-ID` fallback for an empty or missing title. Before acknowledgement,
the popup count and toolbar badge keep updating, but video cards and their actions
stay hidden. Saving acknowledgement reveals the list in the same popup. The
background worker and download page also require the stored boolean before
fetching or saving media.

## Merge video and audio on Linux

After **both files complete**, select **Copy command** in the download tab. The
command uses the actual absolute saved paths, including Chromium's collision
suffixes, and creates `<Title>.mp4` beside the video from the original safe title.

In bash or zsh, check FFmpeg first:

```sh
ffmpeg -version
# Debian/Ubuntu, if it is missing:
sudo apt install ffmpeg
```

Paste the displayed command into your terminal. It uses explicit video/audio
mapping and `-c copy`, so it does not transcode. POSIX quoting preserves apostrophes
and shell-shaped filenames literally. `-n` refuses to overwrite an existing output;
source files remain. If the output exists, change only the final output path in
the command to an unused name, or rename the existing file. Keep both input paths
unchanged. If copying fails, select and copy the displayed command manually.
Audio only, pending pairs and failed pairs have no ready merge command.
Windows/macOS shell commands are not supported in this version.

## Permissions

- Required `<all_urls>`: install-time access lets content scripts find Vimeo players
  and links on HTTP/HTTPS pages and lets the extension fetch Vimeo configs and
  approved CDN metadata/media without per-origin prompts. On non-Vimeo pages,
  scripts inspect only iframe `src` and link `href` references, not page text,
  scripts, forms or input values. Vimeo frames retain config discovery.
- Broad browser access is not an arbitrary fetch API: configs must use validated
  Vimeo ID/hash endpoints; CDN requests require admitted config/track provenance.
  Non-CDN resource origins and redirects are refused. No `activeTab`, `tabs` or
  scripting permission is used.
- `downloads`: starts and observes native saves and reads their actual completed paths.
- `storage`: saves only `{ rightsAcknowledged: true }` in local extension storage.


## Privacy

No telemetry, analytics or extension account. Detection requests player-config and
manifest metadata; a selected download requests its media resources. Extension
fetches omit credentials/referrers and reject redirects. Detection reads Vimeo
config data and minimal Vimeo iframe/link references on other sites. It does not
collect unrelated browsing content or persist browsing history.

Signed config/manifest URLs and detection candidates stay in memory, not extension
storage or popup diagnostics. Acknowledgement is local to the browser profile;
clearing extension storage or using a fresh profile shows the notice again.
Assembly uses temporary disk-backed extension storage, cleaned on completion/error;
a later owner cleans orphan data. Chromium still keeps its normal download history
and saved files, including completed paths. Cancelling does not delete an already
completed file. Developer harness artifacts contain owned fixtures, not live tokens.

## Limits

- Vimeo only; English UI; Linux merge/test support. Live Vimeo config shapes can
  change. Offline fixtures prove supported shapes, not every live Vimeo video.
- No DRM decryption, key/license retrieval, authentication bypass, progressive
  downloads, in-extension mux or live-stream recording. Encrypted, combined,
  byte-range and unknown addressing forms are rejected.
- One download page owns assembly at a time. Temporary storage quota can fail.
  Limits: 4 GiB per file, 10,000 ordered resources, 1 MiB initialization/playlist,
  64 MiB per media segment, no per-read cap. Five disk-backed segment slots bound
  lookahead to 320 MiB; initialization and segments are written in source order.
- Transient network/read errors and HTTP 408/429/500/502/503/504 retry three times
  after the first attempt, with 200/400/600 ms backoff. Thirty seconds without
  progress fails a track. Quota, protection and cancellation do not retry
  automatically. Manual Retry still requires current consent and approved sources.
- There is no pre-download file-size metadata in the track model. No size estimate
  is invented. Progress uses observed bytes in MiB; unknown native totals say
  `unknown`. Native completion, not metadata detection, confirms saved files.

See [download contracts and proof](docs/M3-DOWNLOAD.md) and
[the offline Chromium harness](docs/browser-harness.md) for exact supported shapes.

## FAQ

**Why are there no quality buttons?** The source may be protected, unsupported,
unavailable or still resolving. A separate video
and compatible audio must belong to the same source; in-band/combined audio does
not create a pair. Audio only can remain available when no supported pair exists.

**Can I close the popup?** Yes. Keep the download tab open until it finishes. A
partial failure keeps completed files; check each outcome before using a merge command.

**Why is no size shown before download?** The current metadata model has no reliable
file-byte total. Bitrate is not a file size. Progress starts from actual received bytes.

**Where are my files and why was the name changed?** Chromium's download settings
choose the destination and may add collision suffixes. The download tab shows actual
absolute paths after completion. Chrome's **Ask where to save each file before
downloading** setting can show a Save As dialog for each file. Native saving has
no elapsed-time limit. Cancelling a native save shows **Save cancelled** and keeps
any completed companion. Further naming changes (#68) remain queued.

**Why are download or Copy actions blocked?** A saved rights acknowledgement is
required. Open the popup and acknowledge the notice. Missing, invalid or unreadable
storage fails closed; retry acknowledgement if saving fails. Copy checks storage
again even on an already open download page.

**Can I use a protected/private video or another site?** No protection or access
bypass is provided. Only supported Vimeo sources with the required access qualify.
You must have the rights to every download.

## Linux development

Use Node.js 24 and pnpm 10.34.8, also recorded in `mise.toml`. With mise, run
`mise trust` and `mise install`; prefix commands with `mise exec --` if needed.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`verify` runs ESLint, TypeScript (including unused locals/parameters), pinned Knip,
a production build, Node unit checks and real unpacked Chromium smoke. It does
not contact live Vimeo. Run it before every push. The harness needs Playwright
1.64.1 and its matching Chromium (`channel: 'chromium'`), xvfb, Python 3, X11/XTest
libraries and FFmpeg. Provision new machines as described in the harness guide;
`pnpm exec playwright install chromium` installs the browser, not all system tools.

- `pnpm dev`: Vite development server.
- `pnpm build`: production extension in `dist/`.
- `pnpm lint`, `pnpm typecheck`, `pnpm deadcode`: static checks.
- `pnpm unit`: parser/state/transport/download/shell regressions.
- `pnpm smoke`: native Chromium proof; build first.

## Disclaimer and license

You alone are responsible for having rights to any content you download.
You install and use this project at your own risk. The author and contributors
are not liable. Distribution is through GitHub Releases, not browser stores;
current release assets and source-build requirements are described above.

Licensed under the [MIT License](LICENSE).
