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
  index.tsx              entry and font
  App.tsx                root shell, layout toggle, keyboard shortcuts
  updates.ts             user-approved service worker updates
  tabs/tabs.ts           tab model (one EditorState per tab)
  components/Editor      single CodeMirror view shared by all tabs
  components/TabBar      horizontal / vertical tab bar
  components/StatusBar   cursor position
  editor/setup.ts        CodeMirror extensions + theme
```

## Shortcuts

| Action | Alt shortcuts | Ctrl+Shift alternatives |
|---|---|---|
| New tab | Alt+N | Ctrl+Shift+Enter |
| Close tab | Alt+W | Ctrl+Shift+Backspace |
| Previous / next tab | Alt+[ / Alt+] | Ctrl+Shift+, / Ctrl+Shift+. |
| Jump to tab | Alt+1…9 | — |
| Toggle horizontal / vertical tabs | Alt+Shift+L | Ctrl+Shift+L |
| Show keyboard shortcuts | Alt+/ | Ctrl+Shift+/ |

The keyboard icon in the tab bar opens shortcut help. On Mac, Alt means Option and Ctrl means Control. If your tablet keyboard does not deliver Alt shortcuts to the app, try the Ctrl+Shift alternatives. Shortcut matching accepts `key` when the keyboard event omits `code`; physical-key matching is retained for macOS Option dead keys. Actual device/browser shortcut delivery still needs hardware verification.


## GitHub Pages

The public site is hosted at [minggliangg.github.io/sumi](https://minggliangg.github.io/sumi/).
Pushes to `main` run the browser tests, build with base path `/sumi/`, and deploy through `.github/workflows/pages.yml`. Pull requests run the same checks without publishing. Repository Settings → Pages must use **GitHub Actions** as the source.

Tabs currently live in memory. Copy out text you want to keep before closing a tab or leaving the app. Closing a populated tab asks for confirmation. The app asks the browser to warn before leaving when any tab contains text; browser and mobile lifecycle behavior can limit that warning.

When an update is downloaded, an **Update available** button appears beside the cursor position. Updates are checked on launch, when the app returns to the foreground, and when connectivity returns. Pressing the button reloads this window; if any of its tabs contains text, confirmation warns that all text in that window will be discarded. Cancel keeps the session intact. Other windows running this version keep their sessions and can update separately. Otherwise, a waiting update activates after all app windows close. There is no automatic document persistence.

For an installed app running an older release without this button, copy out your text, open it while online to download the update, then fully close the app and any browser tabs showing sumi and reopen it. Older releases may reload when another window activates an update, so close those windows before using the new button.

Tab controls support Arrow keys in the bar's orientation, Home/End, and Delete to close the focused tab. CodeMirror's Escape then Tab lets keyboard focus leave the editor when Tab is used for indentation.
