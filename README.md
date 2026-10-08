# sumi.

A minimalist PWA text editor that doubles as a code editor with optional syntax highlighting. Nearly the whole screen is for writing. The current target is desktop browsers and tablets with a keyboard.

## Stack

SolidJS · Vite · TypeScript · CodeMirror 6 · vite-plugin-pwa · pnpm

## Scripts

```bash
pnpm install
pnpm dev       # dev server
pnpm build     # typecheck + production build (generates service worker)
pnpm preview   # serve the production build
pnpm build:pages # production build for /sumi/ on GitHub Pages
pnpm preview --base=/sumi/ # preview the Pages build locally
pnpm exec playwright install chromium # first-time browser test setup
pnpm test      # browser regressions against the Pages build
```

## Layout

```
src/
  index.tsx              entry, font + service worker registration
  App.tsx                root shell, layout toggle, keyboard shortcuts
  tabs/tabs.ts           tab model (one EditorState per tab)
  components/Editor      single CodeMirror view shared by all tabs
  components/TabBar      horizontal / vertical tab bar
  components/StatusBar   cursor position
  editor/setup.ts        CodeMirror extensions + theme
```

## Shortcuts

| Keys | Action |
|---|---|
| Alt+N / Alt+W | New / close tab |
| Alt+[ / Alt+] | Previous / next tab |
| Alt+1…9 | Jump to tab |
| Alt+Shift+L | Toggle horizontal / vertical tabs |


## GitHub Pages

The public site is hosted at [minggliangg.github.io/sumi](https://minggliangg.github.io/sumi/).
Pushes to `main` run the browser tests, build with base path `/sumi/`, and deploy through `.github/workflows/pages.yml`. Pull requests run the same checks without publishing. Repository Settings → Pages must use **GitHub Actions** as the source.

Tabs currently live in memory. Copy out text you want to keep before closing a tab or leaving the app. Closing a populated tab asks for confirmation. The app asks the browser to warn before leaving when any tab contains text; browser and mobile lifecycle behavior can limit that warning. PWA updates wait until all app windows close instead of reloading an active writing session.

Tab controls support Arrow keys in the bar's orientation, Home/End, and Delete to close the focused tab. CodeMirror's Escape then Tab lets keyboard focus leave the editor when Tab is used for indentation.
