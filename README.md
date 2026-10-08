# 墨 sumi

A minimalist PWA text editor that doubles as a code editor with optional syntax highlighting. Nearly the whole screen is for writing. The current target is desktop browsers and tablets with a keyboard.

## Stack

SolidJS · Vite · TypeScript · CodeMirror 6 · vite-plugin-pwa · pnpm

## Scripts

```bash
pnpm install
pnpm dev       # dev server
pnpm build     # typecheck + production build (generates service worker)
pnpm preview   # serve the production build
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

