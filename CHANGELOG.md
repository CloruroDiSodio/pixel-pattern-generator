# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version lives in two places and must be bumped together:

- `frontend/src/lib/version.ts` → `APP_VERSION` (shown in the footer)
- `backend/app/__init__.py` → `__version__` (reported by `/` and `/api/health`)

## [Unreleased]

Nothing yet.

## [1.1.0] - 2026-10-04

### Added

- **Internationalisation.** The whole studio is available in English and Italian,
  switchable from the header. The choice is persisted in `localStorage`
  (`ppg.locale`) and falls back to the browser's preferred language on a first
  visit; `<html lang>` follows the active locale so screen readers announce the
  right one. Numbers are formatted per locale (`12,345` vs `12.345`).
  - `frontend/src/lib/i18n/en.ts` is the single source of truth: every other
    catalogue is typed `Record<TranslationKey, string>`, so adding a string
    immediately fails the build of any locale that has not translated it.
  - Adding a language is three steps — append the code to `LOCALES`, add a
    `LOCALE_META` entry, drop a catalogue next to `en.ts`.
  - `<option lang="…">` tags in the picker and a `lang`-aware `<select>` keep the
    switcher usable for both languages.
- **"Fit" button next to the zoom slider**, which resizes the canvas to the
  largest whole-pixel zoom at which the whole grid fits the visible panel
  (`frontend/src/lib/zoom.ts`, measured with a `ResizeObserver`). The zoom
  slider's minimum dropped from 4× to 1× so the button is not clamped on narrow
  screens, where a 200-cell grid can need 3×.
- **Versioning.** `APP_VERSION` is rendered in the footer and kept in step with
  the backend's `__version__`; this changelog records user-visible changes.
- **Italian translations** for every screen: header, dropzone, settings, canvas,
  palette, pattern chart, exports, toasts, errors and the skip link.

### Changed

- Error messages raised in the browser (API unreachable, request failed, PNG
  export failures, file validation) are now catalogue keys rendered through
  `localizeError()`, so they translate instead of hard-coding English prose.
  FastAPI's own `detail` strings are still shown verbatim.
- `PixelCanvas`'s `onPick` prop is now a stable `useCallback`, which restores the
  effect of its `memo` wrapper on a 200×200 canvas.

### Fixed

- **Removed the no-op "Preview size" slider.** It wrote `preview_scale`, which was
  sent as `previewScale`, but the studio never sent the `preview` flag that gates
  its only consumer. `render_preview()` therefore never ran and `previewPng` came
  back empty at 1×, 16× and 40× alike, so the control changed nothing on screen or
  in the download while re-uploading the image on every tick. `preview_scale` is
  gone from the settings object, its type and the multipart body; the backend
  `previewScale` / `preview=true` path is untouched and stays supported for
  external API consumers.
- **The pixel canvas no longer jumps when hovering a cell.** Swapping the idle
  hint for the hover chip resized the row above the canvas (a plain span is
  ~16px, `.chip` is ~22px), pushing the canvas down on every hover; `flex-wrap`
  added a whole extra line at narrow widths. The row now reserves `min-h-7` and
  keeps both states on one line.

## [1.0.0] - 2026-10-02

Initial release.

### Added

- Pixel-art conversion pipeline: three resampling modes, four quantizers,
  Floyd–Steinberg and Bayer dithering, and bundled retro palettes (NES, PICO-8,
  Game Boy DMG, Sweetie 16, CGA, greyscale) or a custom hex list.
- FastAPI backend (`/api/transform`, `/api/pattern`, `/api/health`,
  `/api/options`, `/api/palettes`) with per-IP rate limiting on the expensive
  endpoint, security headers and CORS restricted to configured origins.
- Interactive canvas preview with hover-to-inspect and click-to-copy, a palette
  strip with usage percentages, and a printable cross-stitch chart with numbered
  margins, symbols, stitch counts and repeats.
- Exports: PNG at 16×/32×/64×/128×, CSV chart, Markdown and raw JSON.
- Accessibility, SEO and performance work: WCAG AA contrast, keyboard-navigable
  controls, structured data, robots and sitemap, and memoised hot components.

[Unreleased]: https://github.com/CloruroDiSodio/pixel-pattern-generator/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/CloruroDiSodio/pixel-pattern-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/CloruroDiSodio/pixel-pattern-generator/releases/tag/v1.0.0