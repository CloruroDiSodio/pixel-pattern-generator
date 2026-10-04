# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version lives in two places and must be bumped together:

- `frontend/src/lib/version.ts` → `APP_VERSION` (shown in the footer)
- `backend/app/__init__.py` → `__version__` (reported by `/` and `/api/health`)

## [Unreleased]

Nothing yet.

## [1.3.0] - 2026-10-04

### Added

- **Thread brand matching.** The legend can now name the thread a stitcher
  would actually buy — **brand, code, name and how many skeins** — instead of
  stopping at `Colour 1 · #1D2B53 · 12%`.
  - Pick **DMC** in the craft tab and every legend entry gains
    `DMC 304 · Red Medium · 1 skein`. Off by default, so nothing changes until
    you ask for it.
  - **DMC is also a palette preset.** Choose it in the conversion settings and
    the image is quantized onto stitchable shades directly; combined with
    matching, the legend names that exact shade rather than an approximation.
  - **The exports carry it too.** The CSV and Markdown documents gain **Thread**,
    **Thread name** and **Skeins** columns plus a line naming the brand and the
    fabric count the estimate assumes. With no brand selected both documents are
    byte-for-byte what they were before.
  - Matching reuses the *same* redmean `nearest_color_index` the quantiser uses,
    so the swatch that looks closest on screen and the thread recommended agree,
    and ties resolve to the same index as everywhere else. Results are cached
    per unique colour.
- **A skein estimate, with its assumption attached.** One DMC skein is 8 m of
  six-strand floss; cross stitch works two strands, so it is worth 24 m of
  working thread, and a stitch travels the cell diagonal twice. On 14-count that
  is ~4,700 stitches before a 10% waste allowance, **4,251 after** — the figure
  the API returns as `stitchesPerSkein`. Because it depends entirely on the
  fabric, the count travels with the number: `POST /api/pattern` takes
  `fabricCount` (6–40), the legend header states the assumption, and both
  exports print it.
- **Notes on what this is not.** The DMC table is **curated, not complete** —
  121 shades rather than the full 450+ — because nearest-colour matching needs
  the colour space filled, not every point in it. The hexes are the commonly
  published screen approximations; check a physical shade card before buying by
  the skein. **Anchor is not bundled**: its codes are a separate table and a
  plausible-but-wrong one would send somebody to buy the wrong thread.

### Changed

- `POST /api/pattern` accepts `threadBrand` (default `none`) and `fabricCount`
  (default `14`), and answers with `threadBrand` / `fabricCount` /
  `stitchesPerSkein` plus a `thread` object on every legend entry. An unknown
  brand is a `400`; a fabric count outside 6–40 is a `422`.
- `GET /api/options` publishes `threadBrands` so the UI builds its picker without
  a second request. The tables themselves stay out of it.
- Every legend entry now carries `thread`, which is **`null`** when no brand was
  requested. Explicitly null rather than absent, so the UI can tell "no brand
  matched" from "matched, and you need no skein".
- `backend/app/threads.py` is a new module holding the table, the match and the
  estimator. It imports nothing outside the standard library, the same rule
  `utils.py` follows, and the dependency points one way (`processor → threads →
  utils`) so `utils` stays free of it.
- A **new thread option means a new user error**, so the backend now has a second
  failure type internally: `threads.ThreadError`, translated into
  `ProcessingError` at the `build_pattern` boundary. The API still sees exactly
  one failure type and still answers `400`.

### Notes

- **The brand picker lives in the craft tab, not in the conversion settings**, and
  this deviates from the roadmap plan on purpose. A conversion-settings change
  re-runs `/api/transform`, which rebuilds the grid from the source image and
  throws the editor's hand edits away. A control that cannot change a single
  pixel must not be able to discard a stroke. It travels with the pattern
  options instead, so changing it re-posts `/api/pattern` and nothing else — and,
  like the pattern title and repeats next to it, it is not persisted in
  `ppg.settings`.
- **A colour painted over completely needs no skein.** It still appears in the
  legend with `0` stitches (the editor deliberately does not compact the
  palette), and it reports `0` skeins rather than asking somebody to buy a skein
  for nothing.
- **Thread matching adds no backend load.** It runs on the existing, unthrottled,
  debounced `/api/pattern` call and costs at most 40 cached nearest-colour
  lookups per pattern — the rate limit on `/api/transform` is untouched.

## [1.2.0] - 2026-10-04

### Added

- **A pixel editor.** The result is no longer read-only: the canvas now takes
  **inspect · paint · eyedropper · fill · erase**, and every edit feeds straight
  into the rest of the app.
  - **No backend work was needed.** `/api/pattern` re-derives the legend, per
    colour counts, percentages, chart, CSV and Markdown from whatever grid it is
    given, so a hand-edited grid keeps the entire craft pipeline and every export
    in sync. This is what made the editor cheap to build.
  - **Inspect is the default tool** and behaves exactly as before — hover to read
    a cell, click to copy its hex value. Editing is additive; the existing
    click-to-copy is never taken away.
  - Paint and erase respond to click *and* drag; the canvas takes pointer
    capture during a stroke, so a drag that leaves the element (or scrolls on a
    touch screen) still behaves.
  - **Undo / redo**, `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` (`Ctrl+Y` also works), with
    history bounded at 50 steps. The shortcuts stand down while focus is inside a
    text field, so they do not fight the custom-palette input.
  - Clicking a palette swatch now **arms that colour for painting**; copying a
    hex value moved to a button in the strip's detail line, since one swatch
    cannot carry two nested interactive controls.
  - The eraser paints the **Transparent background** colour. That colour is not
    guaranteed to be one of the quantiser's choices, so it is appended to the
    palette on first use, with a chart symbol appended alongside it.
  - A **"Edited"** badge marks unsaved-by-the-server work, **Re-run** asks for
    confirmation before discarding it, and any other change to the conversion
    settings says so in a toast rather than dropping the edits silently.
  - Palette percentages are recomputed from the edited grid, so the swatches keep
    adding up to 100 %.
  - Accessibility: every tool is a real `<button>` with `aria-pressed` inside a
    `toolbar` role, the shortcuts are documented in the panel, and the canvas
    keeps its `role="img"` and `aria-label`.
- **The settings controls now look disabled before an image is loaded.** They
  already were — `disabled={!image}` has always been passed through — but
  `.select`, `.text-input`, `input[type=range]` and `input[type=color]` had no
  `disabled:` styling, so they rendered at full opacity and read as live controls
  that happened to do nothing. They now dim and drop the pointer cursor like the
  buttons already did, and the panel explains why: *"Add an image to turn these
  controls on."*

### Changed

- `useTransformPipeline` now owns only `POST /api/transform`. The
  `/api/pattern` call moved into a new `usePatternSync` hook, which accepts an
  optional edited grid. The split removes a cycle: the editor has to be built
  from the transform, so the transform hook could not be given the editor's
  output. Both are still debounced and abortable, and the page wires them
  together.
- New `lib/pixelEdit.ts` holds the grid maths as pure functions — `paintCell`,
  `floodFill`, `recountPalette`, `withColor` — with no React and no I/O.
- Italian translations for every new string.

### Notes

- A colour that is painted over completely stays in the legend at `0` stitches
  rather than being dropped. Compacting the palette would renumber the grid, and
  the undo stack holds grids in the original indexing, so pruning it would
  introduce a real correctness hazard for a cosmetic gain.
- Editing does not add backend load beyond what the app already did:
  `/api/pattern` is *not* rate limited (only `/api/transform` is), and the
  override is debounced at 250 ms, so a drag across the canvas produces one
  request at the end of the stroke rather than one per pointer event.
- The canvas is not yet keyboard-paintable — painting needs a pointer. The undo
  stack and tool selection are fully keyboard accessible, and the canvas keeps
  its `role="img"` description.

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

[Unreleased]: https://github.com/CloruroDiSodio/pixel-pattern-generator/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/CloruroDiSodio/pixel-pattern-generator/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/CloruroDiSodio/pixel-pattern-generator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/CloruroDiSodio/pixel-pattern-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/CloruroDiSodio/pixel-pattern-generator/releases/tag/v1.0.0