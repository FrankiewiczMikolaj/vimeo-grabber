# Synthetic fixture detection

This is an offline M1 seam, not live Vimeo extraction. The owned page is
`test/fixtures/synthetic-vimeo.html`. It declares one dummy plain-text stream;
there is no video, external asset, player script, or network dependency.

## Callable contract

Import `detectStreams` and type `DetectedStream` from `src/detect/index.ts`.
Call `detectStreams(document)` in the Vimeo page context. It is synchronous,
uses no extension API, and returns `DetectedStream[]`:

```ts
interface DetectedStream {
  readonly id: string;
  readonly title: string;
  readonly downloadUrl: string;
}
```

The supported result is exactly one stream, or `[]` for unsupported input.
Detection requires HTTPS on `vimeo.com`, `www.vimeo.com`, or `player.vimeo.com`
and `script#synthetic-vimeo-player[type="application/json"]` containing:

```json
{"version":1,"stream":{"id":"owned-id","title":"Owned title","downloadUrl":"data:text/plain;charset=utf-8,Owned%20dummy%20bytes%0A"}}
```

All three stream fields must be nonblank strings. The URL must use the exact
plain-text data prefix above with a nonblank, valid URI-encoded payload.
Missing nodes, malformed JSON, unsupported versions, invalid fields, other
origins, and other download URL types return `[]`. Values come from the config,
not the heading or detector constants. The fixture payload decodes to
`Vimeo Grabber owned synthetic fixture.` followed by a newline.

## Popup and browser integration

`src/detect/content.ts` calls `detectStreams(document)` in the isolated content
script on the three HTTPS Vimeo hosts. The popup asks the active tab's top frame
for its result through extension messaging; it never parses the popup document.
No `activeTab` grant is needed, including when opened by `chrome.action.openPopup`.
Newly installed or reloaded extensions may need the Vimeo tab reloaded first.

The popup renders the declared title with `textContent`. Missing configs show an
empty state; missing receivers and other inspection failures show an error with
no download control. Unsupported pages cannot supply a fixture through this path.
`src/download.ts` passes the declared plain-text URL to `chrome.downloads.download`
with fixed filename `vimeo-grabber-synthetic.txt`. It overwrites an existing file
of that name. A resolved call means started, not completed; the UI directs users
to Chromium Downloads for completion. API rejections show a retryable error.

For offline Chromium checks, intercept `https://vimeo.com/fixture`, fulfill it
with the fixture HTML, and abort other external requests. Focus that tab before
opening the action; use the CDP child session described in
[the harness guide](browser-harness.md) to click its button. For native filename
proof, set a fresh profile's download directory, disable Playwright download
acceptance, and restore CDP `Browser.setDownloadBehavior` to `default`.
Playwright's download overrides can replace the extension's requested filename.
Inspect `chrome.downloads.search` for completion and read the saved bytes.

`node --test test/detect.test.mjs` checks config values, mutation, origin bounds,
and rejection cases. `pnpm unit` also checks the exact permissions, Vimeo match
scope, default CSP, and bundled popup boundary. Real Chromium is required to
prove page-context messaging and the saved download. The default `pnpm verify`
now runs that end-to-end scenario; see [the harness guide](browser-harness.md).
