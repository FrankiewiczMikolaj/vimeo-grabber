---
opened: 2026-10-27
landed: 2026-10-27
---

# F007 · A synthetic Vimeo page exposes one detectable stream

## Outcome

Contributors can load an offline synthetic Vimeo page with one clearly labelled dummy stream and detect that stream through a small typed detection module. This supplies the first seam of the M1 walking skeleton without claiming live Vimeo support.

## Scope

- Start with a self-contained synthetic Vimeo HTML fixture and a TypeScript detect module.
- Use an explicit embedded configuration contract that the browser harness can serve at a synthetic Vimeo URL without contacting Vimeo.
- Expose stream identity, title, and download URL for later popup consumption; document the callable contract.
- Keep fixture data harmless, owned, deterministic, and suitable for an actual Downloads API dummy file.

## Out of scope

- Popup wiring, browser permissions, Downloads API calls, and toolbar interaction.
- Live Vimeo extraction, adaptive streams, real video downloading, and shell merging.

## Acceptance

- Loading the fixture in real Chromium and calling detection yields exactly its declared single stream with the expected title and download URL.
- A non-Vimeo page and missing or malformed fixture configuration yield no usable stream without crashing.
- A regression check proves stream values come from the embedded fixture rather than a hard-coded result.
- Local pnpm verify passes before every push; PR Verify extension and CodeQL checks are observed separately.
- The draft PR targets current main and has milestone M1 Walking skeleton.
