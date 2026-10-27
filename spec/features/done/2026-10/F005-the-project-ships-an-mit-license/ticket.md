---
opened: 2026-10-27
landed: 2026-10-27
---

# F005 · The project ships an MIT license

## Outcome

Users and contributors receive the standard MIT grant and warranty disclaimer with the repository. Ownership is stated publicly without introducing a personal email address.

## Scope

- Add the standard MIT LICENSE using the public repository owner name and current year.
- Link the license from the existing README without changing the separate product rights disclaimer.

## Out of scope

- A broader legal rewrite, GitHub Pages, and in-extension notice persistence.
- Release publication, workflow changes, and package dependency updates.

## Acceptance

- LICENSE contains the complete standard MIT text and names the public repository owner.
- README links the license and retains the existing own-risk/content-rights legal notice.
- Local pnpm verify passes before push.
- The draft PR targets main and has milestone M0 Foundation.
