# sumi.

A minimal text and code editor for desktop browsers and tablets with a keyboard. Install it as a PWA for a focused writing space.

[Open sumi.](https://minggliangg.github.io/sumi/)

## Features

- Independent tabs with horizontal or vertical layouts and a compact menu on small screens.
- Syntax highlighting and local formatting for JavaScript, TypeScript, JSX, TSX, Python, JSON, HTML, CSS, Markdown and SQL. Choose Auto, Plain text or a language per tab.
- Markdown preview: split view in wide windows, full-width preview in narrow ones.
- Six themes with light, dark and system modes; optional line numbers and adjustable text size.
- A basic stopwatch and adjustable countdown in the status bar. Timers keep running with the panel closed and reset when the app reloads.
- UTF-8 file import, download export and optional draft names (double-click a tab or press F2).

Language packs, formatters and the Markdown renderer download on demand and cache for offline use. First use requires connectivity. Documents above 5 MiB of UTF-8 data use plain text and cannot be formatted.

## Saving and updates

Drafts save automatically to IndexedDB. Reload restores tabs, text, language, selection and scroll; undo history lasts only for the session. Each window has its own workspace. **Recently closed** retains the latest twenty nonempty drafts.

Browser storage can be cleared or evicted, so export writing you want to keep. Export downloads a copy; it does not write back to the original file.

Updates require approval and save drafts before reloading. Check for updates in **Settings**; storage failures leave writing in memory and show a retry action.

## Shortcuts

| Action | Shortcut | Alternative |
|---|---|---|
| New / close tab | Alt+N / Alt+W | Ctrl+Shift+Enter / Ctrl+Shift+Backspace |
| Previous / next tab | Alt+[ / Alt+] | Ctrl+Shift+, / Ctrl+Shift+. |
| Jump to tab | Alt+1…9 | — |
| Toggle tab layout | Alt+Shift+L | Ctrl+Shift+L |
| Show / hide vertical tabs | Alt+Shift+B | — |
| Markdown preview | Alt+Shift+P | — |
| Line numbers | Alt+Shift+N | — |
| Format document | Ctrl+Shift+F | — |
| Shortcut help | Alt+/ | Ctrl+Shift+/ |

The keyboard icon opens shortcut help. On Mac, Alt means Option. Browser and hardware keyboard shortcut delivery still needs device verification.

## Development

SolidJS · Vite · TypeScript · CodeMirror 6 · vite-plugin-pwa · pnpm

```bash
pnpm install
pnpm dev                              # development server
pnpm build                            # typecheck + production build
pnpm preview                          # serve the production build
pnpm exec playwright install chromium # first-time test setup
pnpm test                             # browser tests against the Pages build
pnpm build:pages                       # build with base /sumi/
pnpm preview --base=/sumi/             # preview the Pages build
```

Tabs share one CodeMirror view and retain independent editor states. See [AGENTS.md](AGENTS.md) for architecture guidance. Builds emit `dist/language-bundle-report.json` with bundle sizes.

Pushes to `main` run tests and deploy to GitHub Pages via `.github/workflows/pages.yml`. Configure Pages to use **GitHub Actions** as its source.
