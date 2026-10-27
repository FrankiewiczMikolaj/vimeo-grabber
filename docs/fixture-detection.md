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

## Later popup and browser integration

The caller must obtain the page document in its page execution context; a popup
must not pass its own extension document. This change does not add injection,
permissions, popup wiring, or Downloads API calls. Bundle the module in the
future page-side entry point; its plain result can cross the extension message
boundary. A later download caller can give `stream.downloadUrl` to
`chrome.downloads.download` with an owned `.txt` filename. It is not a media URL.

For offline Chromium checks, intercept `https://vimeo.com/fixture`, fulfill it
with the fixture HTML, and abort all other network requests. Evaluate the actual
compiled detector against that document. Change the embedded fields and repeat
to distinguish config parsing from a hard-coded return. Test another origin and
missing/malformed config for an empty result. No request should reach Vimeo.

`node --test test/detect.test.mjs` checks config values, mutation, origin bounds,
and rejection cases. `pnpm unit` discovers both `test/*.test.mjs` files; the
existing manifest checks remain unchanged. Real Chromium is still required to
prove DOM selection and fixture-origin behavior.
