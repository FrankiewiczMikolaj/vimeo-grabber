# Test the prepared 0.4.0 build

Linux with Chromium/Chrome and bash or zsh is the supported test platform. Use
only videos you own or have permission to download. No DRM or access bypass.
Offline fixture proof does not establish compatibility with every live Vimeo video.

## Identify and load

Record the full source SHA, Actions run URL and artifact name from
[CI packages](docs/ci.md). Extract the outer Actions ZIP, then the inner
`vimeo-grabber.zip` into a fresh directory. Load that directory (with
`manifest.json` at its root) through `chrome://extensions` → Developer mode →
Load unpacked. Confirm **0.4.0** in Details. Reload existing test pages.
A source archive is not an installable extension. Do not mix old build files.

## Own-machine checks

1. In a fresh profile, confirm the rights notice and footer. Before acknowledgement,
   the toolbar/popup count can update but cards and download actions stay hidden.
   Acknowledge, reopen the popup and restart Chromium: the notice stays dismissed.
2. Open an authorised Vimeo video or embedded/private link. Confirm one card/count
   per video. Start playback and use **Refresh** if needed. A 401/403 shows
   restricted/private access, not DRM; restore legitimate page access and Refresh.
   Refresh must not reload the page or start media saving.
3. Choose a clear **separate** quality with matching audio. Keep the download tab
   open. Expect exactly two completed native files: `<Title> - video <quality>.mp4`
   and `<Title> - audio.m4a`. Names use a safe 96-byte title stem, with `vimeo-ID`
   fallback. Chrome may add collision suffixes; compare the displayed completed
   absolute paths with the files actually saved.
4. After both complete, **Copy command** must use those actual paths and create
   `<Title>.mp4` beside the video from the original safe title. Run `ffmpeg -version`
   first (Debian/Ubuntu install hint: `sudo apt install ffmpeg`). Paste into bash/zsh.
   Expect video and audio without transcoding, unchanged inputs, and `-n` refusal
   if the output already exists. If clipboard access fails, copy the displayed
   command manually. Never replace the input paths with guessed filenames.
5. Choose **Audio only**: exactly one audio file, no merge command. If offered,
   choose **MP4 · video + audio**: exactly one playable combined file named
   `<Title> [<height>p].mp4` (`original` if height is absent), no merge or audio
   extraction. Declared size may be unknown; separate bitrate is not a file size.
6. Use an authorised protected/DRM example if available. Expect refusal and no
   successful media file; no key/license retrieval. Record unavailable cases as
   not tested, not passed. Unsupported encryption/addressing is not DRM.
7. Enable Chrome's **Ask where to save each file before downloading**. Hold each
   Save As dialog for over 32 seconds: the row must keep waiting, not time out.
   Finish both saves and check paths. Repeat with native cancellation: expect
   **Save cancelled**, no merge command, and any completed companion retained.
8. During a separate pair, close the popup, switch tabs and close the source tab:
   admitted work continues in the download tab. Reopen the popup and use
   **Open download**. **Cancel file** affects one row; **Cancel** stops active/queued
   work. **Retry** restarts only the failed/cancelled file, never its completed
   companion. Closing the download tab cancels its active work. Partial
   `.crdownload` files are not successful files or merge inputs.

Report each result, missing case, browser version and exact build identity through
[#53](https://github.com/FrankiewiczMikolaj/vimeo-grabber/issues/53). The coordinator
supplies the actual successful **post-merge main** run and artifact before final
acceptance. A draft-PR ZIP is not that build. Mikołaj must explicitly approve that
exact main package before a tag, release or M3 closure; preparing 0.4.0 does not
publish it. Permissions, privacy, limits and liability remain in [README](README.md).
