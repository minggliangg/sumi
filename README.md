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
  components/TabBar      horizontal / vertical tab bar; vertical becomes a drawer on phones
  components/Menu        overflow action menu used on narrow screens
  components/StatusBar   save state, format, text size, language picker, cursor position
  appearance.ts          theme, light/dark mode and line-number preferences
  themes/palettes.css    colour palettes for the non-default themes
  media.ts               media-query signal and the shared narrow-screen breakpoint (640 px)
  editor/setup.ts        CodeMirror extensions + theme
  editor/languages.ts    curated language registry + local detection
```

## Shortcuts

| Action | Alt shortcuts | Ctrl+Shift alternatives |
|---|---|---|
| New tab | Alt+N | Ctrl+Shift+Enter |
| Close tab | Alt+W | Ctrl+Shift+Backspace |
| Previous / next tab | Alt+[ / Alt+] | Ctrl+Shift+, / Ctrl+Shift+. |
| Jump to tab | Alt+1…9 | — |
| Toggle horizontal / vertical tabs | Alt+Shift+L | Ctrl+Shift+L |
| Toggle line numbers | Alt+Shift+N | — |
| Show keyboard shortcuts | Alt+/ | Ctrl+Shift+/ |
| Format document | — | Ctrl+Shift+F |

The keyboard icon in the tab bar opens shortcut help. On Mac, Alt means Option and Ctrl means Control. If your tablet keyboard does not deliver Alt shortcuts to the app, try the Ctrl+Shift alternatives. Shortcut matching accepts `key` when the keyboard event omits `code`; physical-key matching is retained for macOS Option dead keys. Actual device/browser shortcut delivery still needs hardware verification.


## Small screens

At 640 px wide or less the tab bar keeps only the tab strip, **New tab** and a **More actions** (⋯) menu holding Rename tab, Open file, Export file, Recently closed, the tab layout switch and Keyboard shortcuts. With vertical tabs, the sidebar becomes a slide-over drawer opened from the tab button on the left of the bar; choosing a tab, tapping outside or pressing Escape closes it. Status text collapses to icons and a save indicator dot, and dialogs open as bottom sheets (the language picker opens from the top so the on-screen keyboard does not cover it). The status row sits below the editor rather than floating over it.

Icons come from [Lucide](https://lucide.dev) (`lucide-solid`, ISC licence), imported per icon so only the ones in use are bundled.

## Syntax highlighting

The language button beside the cursor position opens a searchable picker. Each tab has its own **Auto**, **Plain text**, or manual language choice. JavaScript, TypeScript, JSX, TSX, Python, JSON, HTML, CSS, Markdown and SQL are available through seven lazy-loaded packs. Highlight colours follow the system light/dark theme.

Auto detection runs locally after pasting or 750 ms without edits and inspects at most the first 16 KiB. It recognises strong code signals; ambiguous prose stays plain text. Once detected, a language stays selected during ordinary editing. Emptying the document, replacing the whole document by paste, or selecting Auto again resets detection. Manual choices always take precedence. Tab titles come from the first line and are not treated as filenames.

Packs download when requested and are cached for offline use. On the first visit, loading waits up to two seconds for the service worker to control the page, so the initial pack can be cached. Language metadata ships with the app shell; pack dependencies are fetched successfully before importing, so failed downloads can be retried. Unused packs are excluded from the initial installation. An unavailable pack leaves the editor usable in plain text with a Retry action. Browser storage eviction can remove cached packs; a first download requires connectivity. There is no separate pack removal manager. Previous-release caches are retained so open windows can keep using their assets; installed storage can therefore grow across updates. Documents above 5 MiB of UTF-8 data use plain text until they fall below the limit.

Production builds emit `dist/language-bundle-report.json` with minified and gzip sizes for the initial JavaScript, each language and formatter dependency closure, and their combined payloads. These code sizes exclude browser cache overhead and retained releases, so they are not installed-storage measurements.

Language changes preserve text, selection, undo history and scroll position. Documents, language choices, selection and scroll position recover from IndexedDB after reload; undo history starts fresh. Imported filenames provide extension-based detection before content heuristics.

## Formatting

Use **Format document** beside the language picker or **Ctrl+Shift+F** to format the active document. Formatting supports JavaScript, TypeScript, JSX, TSX, JSON, CSS, HTML, Markdown, Python and SQL. Select a language manually when Auto cannot identify it. Plain text and documents above the highlighting size limit cannot be formatted.

Formatting runs locally in a worker and downloads its formatter assets only when requested. Successfully requested assets are cached for offline use; the first download requires connectivity. Python formatting downloads a roughly 10.4 MiB Ruff WebAssembly runtime (about 3.7 MiB gzip); all formatter assets together are about 12.7 MiB raw / 4.35 MiB gzip in the current build. Highlighting Python does not download this runtime. Browser cache storage and retained releases can add overhead. Syntax errors or unavailable assets leave the document unchanged and show a short error. Retry after correcting the source or reconnecting. A document edited or given a different language while formatting is in progress keeps the newer state; run Format document again.

Formatting preserves selection and scroll position and creates one undoable edit. An unchanged result adds no undo history. Switching tabs during formatting applies a completed result only to its original tab; closing that tab discards the result. Format settings are currently fixed: two-space indentation, 80-column wrapping, double quotes and semicolons for Prettier-supported languages; Python uses Ruff with four-space indentation, 88-column wrapping and double quotes; SQL uses two-space indentation and uppercase keywords. Markdown embedded code blocks are not reformatted. Documents and language choices are automatically saved for recovery.

## Settings, themes and line numbers

The sliders icon beside the language picker opens **Settings**: theme, colour mode, line numbers, text size and updates. All choices are remembered in this browser when storage is available.

**Themes:** Sumi (default), Solarized, GitHub, One, Gruvbox and Catppuccin, each with a light and a dark variant. **Colour mode** is System (follows the operating system, live), Light or Dark. Palettes are CSS custom properties selected by `data-theme` and `data-mode` on `<html>`; a small inline script in `index.html` applies the saved choice before first paint. Text colours were checked for WCAG AA contrast, which required small lightness adjustments to a few canonical IDE colours (such as Solarized's comment grey); the playwright suite re-checks every theme in both modes. To add a theme, add a light and a dark block to `src/themes/palettes.css` and an entry to `THEMES` in `src/appearance.ts`.

**Line numbers** are off by default. Toggle them in Settings or with Alt+Shift+N. The gutter is always part of each tab's editor state and is shown or hidden with CSS, so toggling never rebuilds documents; numbers are quiet and the current line's number is emphasised.

## Text size

In **Settings**, adjust editor text from 16 to 28 px in one-pixel steps, or reset to 16 px. The choice is remembered in this browser when storage is available. Changing size keeps text, selection and undo history intact. Editable text uses a 16 px minimum to mitigate iPhone Safari focus zoom; pinch zoom remains available.

The same dialog offers **Check for updates**, with a visible result and an Install update action when an update is ready. Updates still preserve drafts before reloading.

## GitHub Pages

The public site is hosted at [minggliangg.github.io/sumi](https://minggliangg.github.io/sumi/).
Pushes to `main` run the browser tests, build with base path `/sumi/`, and deploy through `.github/workflows/pages.yml`. Pull requests run the same checks without publishing. Repository Settings → Pages must use **GitHub Actions** as the source.

Documents save automatically to IndexedDB after a short pause. The status reports Saving, Saved or a storage error with Retry. Reload restores tab order, active document, language choices, selection and scroll position; undo history is not saved. A leaving warning remains while changes are pending or saving has failed. Browser storage can be evicted or cleared, so export files you need to retain independently.

Each app window owns an independent workspace. Reload recovers that window; a later launch can recover an available saved workspace. Storage revisions and workspace locks protect against two windows overwriting one another. A storage failure leaves writing in memory and makes the failure visible; a failed read does not replace the saved workspace. If competing saves conflict, Retry saving preserves this window’s drafts in a separate workspace without replacing the other window’s saved text.

Double-click a tab or press F2 while its tab control is focused to give a draft an optional name. Cancel preserves the current name; an empty name restores the title derived from the first line. Names recover with drafts, and export adds the selected language extension when a name has no extension.

**Open file** copies a selected UTF-8 text file into a named tab and detects supported filename extensions. **Export file** downloads the active document using its imported filename, or a name derived from the title and language. These controls use portable file input and download APIs; they do not write back to the original file or retain filesystem access.

Closing a populated tab retains it under **Recently closed**. The newest twenty nonempty closed drafts are kept for recovery. Restore reopens a draft; Delete asks before permanently removing that saved draft. Empty tabs are not retained.

When an update is downloaded, an **Update available** button appears beside the cursor position. Updates are checked on launch, when the app returns to the foreground, and when connectivity returns. Pressing the button saves this workspace before reloading it; a storage failure leaves the session intact and reports an error. Other app windows keep their own sessions and can update separately. There is no automatic reload while editing.

For an installed app running an older release without this button, export or copy your text before fully closing the app and any browser tabs showing sumi. and reopening it. Older releases do not have the current recovery and update protections.

Tab controls support Arrow keys in the bar's orientation, Home/End, and Delete to close the focused tab. CodeMirror's Escape then Tab lets keyboard focus leave the editor when Tab is used for indentation.
