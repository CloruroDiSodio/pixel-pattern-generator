# Pixel Art & Pattern Generator

Turn any photo into a **pixel art grid**, quantize it to a retro palette and export a
**printable cross-stitch / craft pattern** (chart, CSV, Markdown, PNG).

The heavy lifting — resampling, colour quantization, dithering and matrix generation —
happens in a small FastAPI + Pillow service. The Next.js front-end handles upload,
the interactive canvas preview and all the controls.

```
┌──────────────────────────┐        multipart/form-data        ┌───────────────────────────┐
│  frontend/  Next.js 14   │  ──────────────────────────────►  │  backend/  FastAPI+Pillow │
│  TS · Tailwind · Canvas  │  ◄──────────────────────────────  │  quantize · dither · grid │
└──────────────────────────┘        JSON grid + pattern        └───────────────────────────┘
```

## Features

| | |
| --- | --- |
| 🖼️ **Upload** | Drag & drop, paste or browse. PNG, JPEG, GIF, WEBP, BMP, TIFF up to 15 MB. |
| 🎨 **Pixelate** | Grid width 4–200 cells, aspect ratio preserved, three resampling modes. |
| 🎯 **Quantize** | Median cut / max coverage / fast octree / libimagequant, 2–40 colours. |
| ✨ **Dither** | Floyd–Steinberg error diffusion and Bayer ordered dithering — both implemented from scratch, because Pillow's `dither=` argument is silently ignored. |
| 🎮 **Palettes** | NES, PICO-8, Game Boy DMG, Sweetie 16, CGA, greyscale — or your own hex list. |
| 🧵 **Craft patterns** | Symbol chart with numbered margins, colour legend, stitch counts, repeats. |
| ⬇️ **Export** | PNG (16×–128×), CSV chart, Markdown, raw JSON. |
| ⚡ **Live preview** | Canvas rendering, hover to inspect a cell, click to copy a hex value. |

## Project structure

```text
pixel-pattern-generator/
├── .github/workflows/ci.yml     # pytest + typecheck/lint/build
├── backend/                     # FastAPI + Pillow
│   ├── app/
│   │   ├── main.py              # HTTP layer (routes + Pydantic schemas)
│   │   ├── processor.py         # image processing, quantization, matrices
│   │   └── utils.py             # colour maths + pattern serialisation (no deps)
│   ├── tests/                   # pytest suites (unit + API)
│   ├── requirements.txt
│   └── README.md
├── frontend/                    # Next.js App Router + TypeScript + Tailwind
│   ├── src/
│   │   ├── app/                 # page, layout, global styles
│   │   ├── components/          # Dropzone, PixelCanvas, CraftPattern, …
│   │   ├── hooks/               # useImageUpload, useTransformPipeline, …
│   │   ├── lib/                 # API client, download/export helpers
│   │   └── types/               # shared TS types (mirror the API contract)
│   └── package.json
├── netlify.toml                 # Netlify build config
└── README.md
```

## Quick start

### 1. Backend — http://localhost:8000

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Interactive docs: <http://localhost:8000/docs>

### 2. Frontend — http://localhost:3000

```bash
cd frontend
npm install
cp .env.example .env.local       # defaults to http://localhost:8000
npm run dev
```

Open <http://localhost:3000>, drop an image and the pixel art appears immediately.
Every control re-runs the backend (debounced) while the previous result stays
visible, and stale requests are aborted so a slow response can never overwrite a
newer one.

### 3. Tests

```bash
cd backend   && pytest                                      # 151 tests
cd frontend  && npm run typecheck && npm run lint && npm run build
```

## API

All payloads are **camelCase** on the wire. Interactive reference: `/docs`.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness probe (the UI polls this every 30 s) |
| `GET` | `/api/options` | Supported enum values + hard limits |
| `GET` | `/api/palettes` | Bundled palettes and the chart symbol set |
| `POST` | `/api/transform` | `multipart/form-data` upload → pixel grid, palette, preview PNG |
| `POST` | `/api/pattern` | Pixel grid → cross-stitch chart (CSV + Markdown) |

<details>
<summary><code>POST /api/transform</code> — form fields</summary>

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `file` | binary | *required* | The image to pixelate |
| `gridWidth` | int | `32` | 4–200 columns; height follows the aspect ratio |
| `maxColors` | int | `16` | 2–40 |
| `resizeMode` | enum | `pixelate` | `pixelate` (box) · `sample` (nearest) · `smooth` (lanczos) |
| `quantizeMethod` | enum | `mediancut` | `mediancut` · `maxcoverage` · `fastoctree` · `libimagequant` |
| `dither` | enum | `none` | `none` · `floyd_steinberg` · `bayer` |
| `palette` | enum | `auto` | `auto`, a preset id, or `custom` |
| `customPalette` | string | – | Required when `palette=custom`, e.g. `#1D2B53,#7E2553` |
| `background` | hex | – | Colour transparent pixels are flattened onto (default white) |
| `paletteSort` | enum | `usage` | `usage` · `luminance` · `hex` |
| `previewScale` | int | `16` | 1–40 pixels per cell in the returned PNG |
| `gridLines` | bool | `true` | Draw lines on the preview |

```jsonc
// 200 OK
{
  "width": 32, "height": 21,
  "originalWidth": 600, "originalHeight": 400,
  "palette": [{ "hex": "#FAF0D2", "count": 260, "label": "Colour 1" }],
  "grid": [[1, 0, 0, 1]],          // grid[y][x] -> index into palette
  "symbols": ["A", "B"],
  "previewPng": "data:image/png;base64,...",
  "processingMs": 21,
  "settings": { "grid_width": 32, "...": "..." }
}
```

</details>

<details>
<summary><code>POST /api/pattern</code> — JSON body</summary>

```jsonc
{
  "title": "Mushroom",
  "grid": [[0, 1, 1], [0, 0, 1], [2, 2, 0]],
  "palette": [{ "hex": "#000000", "count": 4, "label": "Black" }],
  "symbols": ["A", "B", "C"],       // optional, auto-generated when omitted
  "repeatX": 2, "repeatY": 1
}
```

Returns `totalStitches`, `rowLabels`, `columnLabels`, a symbol `grid`, a `legend` with
per-colour counts and percentages, plus ready-to-save `csv` and `markdown` documents.
A `/api/transform` response can be fed straight back in — the UI does exactly that.

</details>

### Errors

| Status | When |
| --- | --- |
| `400` | Unsupported image, empty/oversized upload, unknown option value, grid referencing a missing palette index |
| `422` | Missing file or a number outside its documented range (FastAPI validation) |

## Deployment

### Frontend → Netlify

`netlify.toml` is committed and works as-is:

- base directory `frontend`, build command `npm run build`, publish `.next`
  (note: `publish` is resolved **relative to** `base`)
- Set **`NEXT_PUBLIC_API_URL`** to your deployed backend (Netlify UI → *Environment
  variables*); it is inlined into the client bundle at build time, so it must be a
  full public URL and never a `/`-prefixed path
- Keep the `@netlify/plugin-nextjs` entry, or enable the Next.js runtime in the UI

### Backend → Render (or any container host)

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |

Set **`CORS_ORIGINS`** to your Netlify URL (comma separated, e.g.
`https://my-app.netlify.app`); it defaults to `*`. Pillow needs no system packages,
so the default Python image is enough.

## How the conversion works

1. **Decode** — `Image.open` + `ImageOps.exif_transpose` so phone photos are upright;
   transparent pixels are flattened onto the background colour.
2. **Resample** — aspect-preserving resize to `gridWidth` with the selected filter.
3. **Palette** — Pillow builds a candidate palette (median cut & co.), or your
   preset/custom palette is used verbatim.
4. **Map & dither** — every pixel is matched to the closest palette entry using the
   *redmean* distance (better perceptual ranking than plain RGB distance; results are
   cached per unique colour). With dithering on, the error is diffused to neighbouring
   pixels (7/16, 3/16, 5/16, 1/16) or ordered-dithered through a 4×4 Bayer matrix.
5. **Matrix** — unused colours are dropped, the palette is sorted and a remap table
   rewrites the grid so the indexes are contiguous.
6. **Render** — the grid is drawn to a PNG (nearest-neighbour upscale, major line
   every 10 cells) and returned as a data URI for the canvas preview.

## License

MIT