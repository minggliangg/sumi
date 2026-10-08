# Repository guidance

## Project

- This repository is the `sumi` app. Its installed app display name is `sumi.`.
- The app is a SolidJS editor built with Vite and CodeMirror 6. Keep changes consistent with the small, keyboard-focused writing and code editor described in `README.md`.

## Architecture

- Keep one CodeMirror `EditorView` mounted for the editor. Each tab owns an immutable `EditorState`; switching tabs saves the current state and scroll snapshot, then installs the selected tab's state.
- Keep large CodeMirror states and session data outside Solid's reactive store. Keep only renderable tab metadata in the store.
- Create DOM-bound resources within Solid lifecycle owners and clean them up with `onCleanup`. Destroy the CodeMirror view when its component is disposed, and remove global event listeners when their owner is disposed.
- Do not enable automatic PWA updates that reload the app while documents exist only in memory. Coordinate service-worker activation with a safe document-preservation strategy first.
- Document persistence and broader install icon support are not implemented; do not describe them as implemented until they are.

## Checks and claims

- Use `pnpm build` for the TypeScript check and production build.
- Use `pnpm test` for the Playwright suite.
- Use `pnpm build:pages` for the TypeScript check and GitHub Pages build with base path `/sumi/` (`tsc -b && vite build --base=/sumi/`).
- Choose checks that exercise the affected behavior. Browser automation with synthetic keyboard events can verify application handling, but it does not establish that shortcuts work on real keyboards or devices; report hardware verification only when it was performed.
