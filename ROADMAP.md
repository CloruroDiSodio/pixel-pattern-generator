# Roadmap & Feature Planning

Working document for **future features**. It records what we analysed, what we
decided to build (and in what order), and the constraints any future change has
to respect.

- **What shipped** is recorded in [`CHANGELOG.md`](./CHANGELOG.md).
- **How the app works today** is documented in [`README.md`](./README.md).
- This file is the *plan*, not the *history*. When an item ships, move it into
  the changelog and tick it off here.

**Status legend:** `TODO` · `WIP` · `SHIPPED` · `DROPPED` (with a reason)

---

## 1. Baseline (as of v1.1.0)

A **single-image, single-shot** converter:

```
Dropzone ──► POST /api/transform ──► read-only PixelCanvas ──► POST /api/pattern ──► chart ──► exports
             (resize → quantize     (hover to inspect,          (legend, stitch
              → dither → remap)      click to copy hex)          counts, CSV, MD)
```

| Area | State |
| --- | --- |
| Conversion | 3 resampling modes, 4 quantizers, Floyd–Steinberg + Bayer 4×4, grid width 4–200, 2–40 colours |
| Palettes | NES, PICO‑8, Game Boy DMG, Sweetie 16, CGA, greyscale, or a custom hex list |
| Preview | Canvas, zoom 1×–N with a **Fit** button, hover chip, click-to-copy |
| Craft | Symbol chart, numbered margins, legend with %, stitch counts, repeats 1–20 |
| Exports | PNG 16/32/64/128×, CSV chart, Markdown, raw JSON |
| I18n | English + Italian, typed catalogues, `localStorage` (`ppg.locale`) |
| Persistence | Settings only (`ppg.settings`). **The image and its result are lost on reload.** |
| Backend tests | Full pytest suite, coverage-gated, matrix py3.9 + py3.12 |
| Frontend tests | **None** — `package.json` has only `dev/build/start/lint/typecheck` |

### 1.1 Gaps identified

1. **The result is read-only.** `PixelCanvas` can only *inspect* a cell. After
   spending time tuning settings there is no way to fix an individual pixel.
2. **The craft promise is under-delivered.** The pitch is "printable
   cross-stitch pattern", but the legend reads `Colour 1 · #1D2B53 · 12%`. A
   stitcher needs *"DMC 797, buy 2 skeins"*.
3. **Animated GIFs silently lose data.** See **F3a** — this is a **bug**, not a feature.
4. **No comparison, no preprocessing, no continuity.** You cannot see the
   original next to the result, you cannot crop before converting, and a reload
   throws your work away.
5. **Frontend has no test safety net.** Any non-trivial UI logic would land untested.

---

## 2. The key enabling fact

`POST /api/pattern` (`backend/app/main.py:206`) accepts **any** `grid` + `palette`
+ `symbols` and re-derives the legend, per-colour counts, percentages, CSV and
Markdown from scratch. A `/api/transform` response can be fed straight back in —
the UI already does exactly that.

> **Consequence:** client-side pixel editing needs **zero backend changes**.
> Mutate `transform.grid` in memory, re-post to `/api/pattern`, and the entire
> craft pipeline plus every export stays in sync.

This is why F1 below is the cheapest high-value feature in the codebase. Any
future feature that produces a grid should route through this same endpoint
rather than inventing a second serialisation path.

## 3. Prioritised features

Effort is a rough S/M/L for a contributor already familiar with the repo.

### Tier 1 — high value per unit of effort

#### F1. Pixel editor with undo/redo — `TODO` · **effort: M** · ⭐ recommended first

The single feature that turns a *converter* into a *studio*.

- [ ] **Tool palette** in the pixels tab: paint · eyedropper · bucket fill · eraser
- [ ] Paint from `PaletteStrip` (it already has a per-swatch `onSelect`,
      `PaletteStrip.tsx:49`)
- [ ] Erase → background colour (`settings.background`, defaults white)
- [ ] **Undo / redo** history stack, `Cmd+Z` / `Cmd+Shift+Z`, bounded (e.g. 50 steps)
- [ ] Edited grid lives in local state; re-POST to `/api/pattern` (debounced) so
      the legend, counts, chart and exports all follow
- [ ] "Dirty" indicator, plus a confirm step before **Re-run** discards manual edits
- [ ] A11y: every tool is a real `<button>` with `aria-pressed`, shortcuts
      documented in the UI, canvas keeps its `role="img"` + `aria-label`

**Files:** `components/PixelCanvas.tsx`, `components/PaletteStrip.tsx`,
`components/controls.tsx`, new `hooks/usePixelEdit.ts`, `app/page.tsx`
**Backend:** none required (§2)
**Tests:** bucket fill on a non-square grid, undo depth bound, eraser on
background, pattern re-syncs after an edit.

#### F2. Thread brand matching (DMC / Anchor) — `TODO` · **effort: M–L**

The biggest differentiator for the *craft* half of the app, which is currently
pixel-art-first while the marketing promises a stitchable pattern.

- [ ] Bundle a DMC (and optionally Anchor) colour table as ordinary entries in
      `BUILT_IN_PALETTES` (`processor.py:343` — shape
      `{name, description, colors: [{hex, label}]}`)
- [ ] `threadBrand` setting → `TransformOptions` + `/api/options` + `TransformSettings`
- [ ] Match with the existing `nearest_color_index` (redmean, `utils.py:112`) —
      the hard part is already written and cached per unique colour
- [ ] Legend gains brand code, thread name, and **skeins required**
- [ ] Thread code and skein count must appear in the **CSV and Markdown** exports
      too (`grid_to_csv` / `grid_to_markdown`, `utils.py:287` / `:333`), not just
      in the UI

**Skein estimate — ASSUMPTION, validate before shipping.**
A DMC skein is 8 m of 6-strand floss; cross stitch uses 2 strands, so one skein
yields ~24 m of working thread. Per-stitch length is ~2 × the cell diagonal and
depends on the fabric count:

```
stitches_per_skein = usable_length_mm / (2 × diagonal_mm) / (1 + waste)
where diagonal_mm ≈ (25.4 / count) × sqrt(2)
```

On 14-count that lands near **~4,700 stitches per skein**. Check this against a
real bought pattern before it appears in the UI, and state the fabric count the
estimate assumes.

**Files:** new `backend/data/threads.py`, `processor.py`, `utils.py`, `main.py`,
`frontend/src/types/index.ts`, `lib/settings.ts`, `components/CraftPattern.tsx`
**Tests:** nearest-match determinism, skein rounding at the boundaries, CSV/MD
round-trip of the new columns.

#### F3. Animated GIF / sprite sheets — `TODO` · **effort: M**

**3a — Fix the silent data loss first (bug, not a feature).**
`ALLOWED_FORMATS` (`processor.py:411`) advertises `GIF` and the frontend accepts
`image/gif` (`useImageUpload.ts:12`), but `_open_image` calls `Image.open()` +
`load()` with **no `seek()` and no `ImageSequence`** anywhere in the codebase. An
animated GIF uploads, reports success, and silently renders **frame 1 only**.

- [ ] Detect `getattr(image, "n_frames", 1) > 1` in `_open_image`
- [ ] Either honour the frames, or **reject with a clear `ProcessingError`** —
      silent truncation is the worst of the three options
- [ ] Mirror the message in the i18n catalogue so it translates

**3b — Then the actual feature.**

- [ ] Frame stepping; sprite-sheet PNG export (N×M layout)
- [ ] Animated GIF export for pixel-art animators
- [ ] Cap frame count and per-frame cost — see the rate-limit note in §5

**Tests:** animated GIF round-trip (build a 3-frame GIF fixture, assert frame
count), sprite-sheet dimensions, and the rejection path.

---
### Tier 2 — cheap, high polish

#### F4. Dither strength — `TODO` · **effort: S**

`apply_bayer_dither(image, strength=32)` (`processor.py:493`) already takes a
strength that is **never passed and never exposed** — `processor.py:583` calls it
bare. Floyd–Steinberg has no strength at all.

- [ ] `ditherStrength` 0–100 slider, default 50
- [ ] Scale both the Bayer perturbation and the FS error propagation by it
- [ ] At 0 it must be visually identical to `dither=none`

**Tests:** strength 0 ≡ no dither; strength monotonicity; determinism.

#### F5. Crop / rotate / flip before pixelating — `TODO` · **effort: M**

Photos rarely frame well. `Image.transpose` covers rotate/flip almost free; crop
needs a box. Apply in `_open_image` / `_prepare_image` before resizing.

- [ ] Rotate 90/180/270, flip H/V, reset
- [ ] Crop via a draggable rect on the source preview, sent as form fields
- [ ] Persist the crop rect in `ppg.settings` so a reload does not lose it

#### F6. Before/after comparison slider — `TODO` · **effort: S**

Both images are already client-side: the object URL from `useImageUpload` and the
canvas grid. A draggable divider in the pixels tab. Purely presentational.

#### F7. Project save / restore + Import JSON — `TODO` · **effort: S–M**

Today a reload loses the image and the result; only settings survive. The JSON
export already exists, so the import side is nearly free.

- [ ] Persist the project (image data URL or IndexedDB blob + settings + title +
      pattern options) to `localStorage` / IndexedDB
- [ ] **Import JSON** consuming the existing export shape
- [ ] Shareable URL encoding the settings — they are a small flat object, so a
      base64url query string needs no database

**Files:** `hooks/useLocalStorage.ts`, `lib/download.ts`, `components/DownloadMenu.tsx`

### Tier 3 — larger projects

#### F8. Exact grid W×H with an aspect lock — `TODO` · **effort: S–M**

`_prepare_image` (`processor.py:477`) *always* derives height from width. Pixel
artists routinely want exactly 64×64, which the current model cannot express.

- [ ] Optional explicit `grid_height` + a "lock aspect ratio" toggle
- [ ] Keep today's derived-height behaviour as the default

#### F9. Paginated print / PDF — `TODO` · **effort: M–L**

The chart is replaced by an explanation above ~12,000 cells (a deliberate
a11y/performance decision). Real pagination fixes that *and* is what people
actually carry to a needlework shop.

- [ ] Print CSS first — repeating table headers, `@page`, no new dependency
- [ ] A real PDF export only if print CSS proves insufficient
- [ ] Repeat the legend on every page

#### F10. Batch / folder processing — `TODO` · **effort: M**

Blocked-ish by the rate limit (§5). Needs a **batch endpoint**, not N requests.

#### F11. Light theme switch — `TODO` · **effort: M–L**

A light/dark toggle in the header, persisted under `ppg.theme`, defaulting to the
OS preference. Currently **no theming exists at all** — there is no `dark:`
variant, no `prefers-color-scheme` and no `data-theme` anywhere in `src/`.

**This is not a polish item — it is a refactor.** Colours are hardcoded Tailwind
utilities in **65 places across 11 files** (40 × `slate-*`, 25 × `ink-*`), not
CSS variables. The darkest offenders: `CraftPattern.tsx` (18), `page.tsx` (16),
`controls.tsx` (7), `Dropzone.tsx` (6).

Pick one approach and do not mix them:

- [ ] **A — CSS custom properties** (recommended): promote the 12 custom tokens
      (`ink-950…500`, `accent/soft/strong`, `mint`, `amber`, `rose`) to variables
      in `globals.css`, alias them in `tailwind.config.ts`, and replace `slate-*`
      with semantic tokens (`--fg-muted`, `--border`, `--surface`). One place
      changes per token, and F9's print styles can reuse the same variables.
- [ ] **B — `darkMode: 'class'` + `dark:` prefixes** on all 65 usages. Mechanical
      and safe, but every future component must remember the prefix.

Acceptance criteria beyond the toggle itself:

- [ ] **WCAG AA re-verified against the *light* panel backgrounds.** This is not
      optional: the README documents that `slate-500` was already removed for
      measuring 3.7:1–4.2:1 on dark. The same audit has to be redone inverted.
- [ ] `CraftPattern.tsx` is the highest-risk file — its symbol glyphs and cell
      backgrounds must stay legible and colour-accurate in both themes.
- [ ] **No flash of the wrong theme.** The page is statically prerendered, so the
      stored choice must be applied before first paint — a small blocking inline
      script in `layout.tsx`, mirroring how `I18nProvider` defers hydration.
      `next-themes` would solve this but is a **new dependency**; see §5 on
      dependency discipline before reaching for it.
- [ ] `layout.tsx:53` hardcodes `themeColor: '#08090d'` and
      `colorScheme: 'dark'` — both need to follow the active theme.
- [ ] `PixelCanvas.tsx:79,88` draws grid lines as literal `rgba(0,0,0,…)`;
      re-tune the two opacities for a light background.
- [ ] **The artwork must not be tinted.** Swatch legibility in `PaletteStrip` is
      already theme-independent — `contrastText()` (`download.ts:120`) computes
      from the swatch hex, not the theme — so verify it stays correct rather
      than changing it.
- [ ] New catalogue keys in `en.ts` **and** `it.ts` (see §5).

**Files:** `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, all 11
components above, new `hooks/useTheme.ts`, `en.ts` + `it.ts`
**Tests:** the hook's storage + OS-preference fallback, no-FOUC behaviour, and a
contrast assertion per theme so the AA audit cannot silently regress.

---

## 4. Sequencing

```text
0. Frontend test runner (Vitest + Testing Library)   ← gate for everything below
1. F3a  fix silent GIF truncation                     ← correctness bug, tiny
2. F1   pixel editor + undo/redo                      ← best value/effort
3. F4   dither strength                               ← tiny, users will notice
4. F2   thread brand matching                         ← the craft differentiator
5. F7   project save / Import JSON                    ← stops losing work
6. F5 / F6  crop + comparison slider
7. F8 / F11  grid lock, light theme refactor
8. F9 / F10  pagination, batch
```

**Step 0 is not optional.** The backend has coverage-gated pytest; the frontend
has nothing. F1's paint maths and history stack are exactly the kind of logic
that regresses silently.

**F11 is deliberately last among the "nice to have" items** even though a theme
switch is often requested early. It touches 65 hardcoded colour utilities across
11 files, and the WCAG AA audit has to be redone against light backgrounds —
which is a real risk to the accessibility standard this project holds itself to.

---
## 5. Constraints any change must respect

| Constraint | Detail |
| --- | --- |
| **i18n is compiler-enforced** | `frontend/src/lib/i18n/en.ts` is the source of truth; every other catalogue is `Record<TranslationKey, string>`. **Adding a key breaks the build of any locale that has not translated it** — by design. Add to `en.ts` *and* `it.ts` together. |
| **Two version files** | `frontend/src/lib/version.ts` → `APP_VERSION` and `backend/app/__init__.py` → `__version__`. They must be bumped together. |
| **Changelog** | Every user-visible change gets a `CHANGELOG.md` entry under `[Unreleased]`, in Keep a Changelog format. |
| **Rate limit** | 20 requests / 60 s per client IP on `/api/transform` (`main.py:54`). It is **in-memory, therefore per-process**. Expensive work (batch, multi-frame) must be a batch endpoint, not N calls, or users hit 429. |
| **Dependency discipline** | Everything is exact-pinned, `requirements.lock` is hash-verified in CI, and Dependabot tracks pip/npm/actions (OWASP A08). Adding a runtime dependency is a deliberate decision, not a convenience — e.g. F11's `next-themes` suggestion should be weighed against doing it in ~15 lines of inline script. |
| **Format allowlist is a security control** | `ALLOWED_FORMATS` (`processor.py:411`) exists to keep decoders with memory-safety bugs (CVE-2026-25990) unreachable on Python 3.9. Do not add a format casually. |
| **Python version split** | Pillow is pinned with markers: `>=3.10` → 12.1.1 (patched), `<3.10` → 11.3.0. `tests/test_lockfile.py` fails the build if either branch goes missing. |
| **next@14 is unsupported** | Tracked as separate work; the static export is why the RSC advisories are unreachable in this topology. Do not add Server Functions. |
| **Performance budget** | The studio deliberately never requests the server-rendered PNG — it costs ~75 % of the payload and ~80 % of the CPU. Keep new features client-side where possible. |
| **Memoisation** | `PixelCanvas`, `CraftPattern`, `PaletteStrip`, `DownloadMenu` are `memo`-wrapped; their callbacks must stay `useCallback`-stable or the memo is defeated (this has bitten the project before). |

---

## 6. House style

- Comments explain **why**, not **what**. The existing code is unusually good at
  this — it documents the reasoning behind non-obvious choices (e.g. why
  `Image.quantize(dither=...)` is avoided). Match it.
- Prefer pure functions in `backend/app/utils.py`; it deliberately has **no
  dependencies** beyond the stdlib and is the easiest thing in the repo to test.
- Every user-facing string goes through the catalogue — no hard-coded English
  prose in components.
- Ties in colour matching resolve to the lowest index, to keep output
  deterministic. Preserve that.

---

## 7. Decisions log

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-04 | F1 (editor) recommended as the first feature | Best value/effort; needs **no backend work** thanks to `/api/pattern` accepting a raw grid (§2) |
| 2026-10-04 | Frontend test runner is a prerequisite, not a follow-up | F1 introduces non-trivial client logic with zero existing coverage |
| 2026-10-04 | GIF truncation treated as a bug (F3a), not a feature | Silent data loss is worse than an honest rejection |
---