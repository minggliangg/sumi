# sumi. logo

The mark is the Japanese character 墨 (sumi, ink), with a period echoing the app name. The character uses the exact Hiragino Mincho ProN W6 glyph outline; the `sumi.` wordmark uses Helvetica Neue. SVGs contain paths and require no fonts at runtime.

The image-generated concept was replaced after its character strokes were found to be inaccurate. These final assets use genuine font outlines rather than generated lettering.

- `sumi-logo.svg` / `.png`: full logo with wordmark, transparent background.
- `app-icon.svg`: mark and period on a light square background.
- `app-icon-source.png`: 1024px raster export.
- `public/`: SVG favicon, 180px Apple touch icon, 192px and 512px install icons, and a 512px maskable icon.

Regenerate from the repository root on macOS with `swift scripts/generate-branding.swift`. The script requires Hiragino Mincho ProN W6 and Helvetica Neue and fails if the kanji font is unavailable. SVG and PNG exports share the same outlines. The complete icon artwork fits within the central maskable safe circle.
