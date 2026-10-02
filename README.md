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

### Prerequisites

| | Version | Notes |
| --- | --- | --- |
| Python | **3.10+** (3.9 works) | 3.10+ gets the patched Pillow; see [Security](#security) |
| Node.js | **18.17+** | `frontend/.nvmrc` pins 20.17.0 — `nvm use` picks it up |

> **Run the two servers in two separate terminals.** Neither command returns to the
> prompt, so starting the frontend in the same terminal as the backend will look
> like it hung.

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

Check the pill in the header: it should read **“API online”**. It polls
`/api/health` every 30 seconds, so it doubles as your backend liveness check.

### 3. Tests

```bash
cd backend   && pytest                                      # 179 tests
cd frontend  && npm run typecheck && npm run lint && npm run build
```

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Header says **“API offline”** | The backend isn't reachable on the configured URL. Start it (step 1) and confirm <http://localhost:8000/api/health> returns `{"status":"ok"}`. |
| Port 8000 already in use | Either free it (`lsof -ti:8000 \| xargs kill`) or run the backend on another port — **and** update `NEXT_PUBLIC_API_URL=http://localhost:8001` in `frontend/.env.local`, then restart the frontend. |
| `npm run dev` seems to hang | Expected: it's a server. Leave it running and use a second terminal. |
| Frontend still hits the old backend URL | `NEXT_PUBLIC_*` values are inlined at **build/start** time. Editing `.env.local` requires restarting `npm run dev`. |
| Want to check the production bundle | `npm run build && npm start` in `frontend/` instead of `npm run dev`. |
| Stopping the servers | `Ctrl+C` in each terminal, or `pkill -f uvicorn` and `pkill -f 'next dev'`. |

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
| `preview` | bool | `false` | Include the base64 PNG in the response (see note) |

```jsonc
// 200 OK
{
  "width": 32, "height": 21,
  "originalWidth": 600, "originalHeight": 400,
  "palette": [{ "hex": "#FAF0D2", "count": 260, "label": "Colour 1" }],
  "grid": [[1, 0, 0, 1]],          // grid[y][x] -> index into palette
  "symbols": ["A", "B"],
  "processingMs": 21,
  "settings": { "grid_width": 32, "...": "..." },
  "previewPng": "data:image/png;base64,..."   // only when preview=true
}
```

> **`preview` is opt-in.** A server-rendered PNG is by far the most expensive step
> and the largest part of the payload, but a browser draws its own canvas from
> `grid` + `palette`. Measured at 120 columns with `previewScale=24`: **17 ms and
> 23 KB without it, 97 ms and 91 KB with it.** The studio therefore never asks for
> it and renders its own PNG on demand for export. Set `preview=true` if you need
> the raster server-side.

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

## Security

This project is built against the **OWASP Top 10 (2025)**. OWASP does not offer
certification, so rather than claim compliance blindly, here is exactly where each
category stands.

| # | Category | How it is addressed |
| --- | --- | --- |
| A01 | Broken Access Control | The API is intentionally public and completely stateless — no accounts, no sessions, no stored user data, no database. There is nothing to authorize, so the residual risk is resource abuse, handled by rate limiting (see below). |
| A02 | Security Misconfiguration | `CORS_ORIGINS` no longer defaults to `*`; it falls back to `http://localhost:3000` and logs a warning until you set it. `/docs`, `/redoc` and `/openapi.json` are disabled with `ENABLE_DOCS=false`. Responses carry `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`. `poweredByHeader` is off. |
| A03 | Software Supply Chain Failures | All versions exact-pinned. `requirements.lock` additionally hashes every transitive dependency and CI installs it with `--require-hashes`. Dependabot tracks pip, npm and GitHub Actions. See the Pillow note below. |
| A04 | Cryptographic Failures | No secrets, tokens or personal data are stored or logged; no data at rest; TLS is terminated by the hosting platform. |
| A05 | Injection | No SQL, no shell, no `eval` — the API never reaches a database or spawns a process. React escapes by default. Exported CSV cells are neutralised against spreadsheet formula injection and the Markdown export escapes control characters. |
| A06 | Insecure Design | Uploads are capped at 15 MB, grids at 200 cells, palettes at 40 colours, and the source image at 40 MP (decompression-bomb guard). The expensive transform endpoint is rate limited. Only an allowlist of image formats is ever decoded. |
| A07 | Authentication Failures | Not applicable — there are no credentials, accounts or sessions to protect. |
| A08 | Software/Data Integrity Failures | Hash-pinned dependency install in CI, exact version pins in both ecosystems, and a CI gate that must pass before merge. |
| A09 | Security Logging & Monitoring | Rejected uploads, unsupported formats, invalid pattern payloads and rate-limit hits are logged at `WARNING` with the client address. Unhandled exceptions are logged server-side and returned to the client as a bare `500` — never a stack trace. |
| A10 | Mishandling of Exceptional Conditions | Every user-triggerable failure raises `ProcessingError` and becomes a `400` with a readable message; out-of-range numbers become `422`. |

### Image decoding

Uploads are decoded from an **allowlist** (`PNG`, `JPEG`, `GIF`, `WEBP`, `BMP`,
`TIFF`). The format is checked immediately after `Image.open()` — which only sniffs
the header — and **before** `load()` decodes any pixels, so a decoder is never
invoked for a file we did not ask for. This is deliberately an allowlist rather
than a blocklist, so newly added Pillow decoders are safe by default.

This matters concretely: **CVE-2026-25990** is an out-of-bounds write in Pillow's
PSD decoder, reachable by any anonymous visitor uploading a crafted `.psd`. The
allowlist closes that path regardless of the installed Pillow version.

### Rate limiting

`POST /api/transform` allows **20 requests per 60 seconds per client**, returning
`429` with a `Retry-After` header. Tune with `RATE_LIMIT_REQUESTS` and
`RATE_LIMIT_WINDOW`.

The bucket is in-memory and therefore **per process**: with several uvicorn workers
each one keeps its own counter, so the effective global limit is
`limit × workers`. For a hard limit, also enforce limits at the edge (Cloudflare,
Netlify, or an nginx `limit_req` zone in front of the service).

### Known limitations

- **`next@14.x` is an unsupported release line.** It is currently at the patch level
  for every published advisory, but Next.js lists 14.x as unsupported, so it will
  receive no further security fixes. The upgrade to 15.x/16.x is tracked as separate
  work; our static export uses no Server Functions, which is why the React Server
  Components advisories are not reachable in this topology.
- **Python 3.9 cannot receive a patched Pillow.** The CVE-2026-25990 fix ships in
  12.1.1 and every 12.x release requires Python ≥ 3.10, so `requirements.txt` pins
  the patched Pillow on 3.10+ and the newest possible (11.3.0) on 3.9. On 3.9 the
  format allowlist is what keeps the vulnerable decoder unreachable. **Use Python
  3.10+ if you can** — CI tests both paths.

## Accessibility, SEO & performance

**Accessibility** — every control has a programmatic label, the file input is a real
`<label>` rather than a `role="button"` wrapper, form ids contain no spaces, and a
"Skip to the studio" link jumps past the header. Body text uses `slate-400`
(6.9:1–7.8:1 against the panel backgrounds); `slate-500` was removed because it
measured 3.7:1–4.2:1 and failed WCAG AA. The craft chart is a real `<table>` with a
caption and scoped headers, and is replaced by an explanation above ~12,000 cells so
neither the browser nor a screen reader has to walk 40,000 nodes.

**SEO** — the page is statically prerendered, so all content is crawlable.
`src/lib/seo.ts` holds the canonical title, description and keywords, consumed by
`layout.tsx` (Open Graph, Twitter card, canonical, robots directives,
`metadataBase`) and by the JSON-LD `SoftwareApplication` block.
`src/app/robots.ts` and `src/app/sitemap.ts` emit `/robots.txt` and `/sitemap.xml`.
Set `NEXT_PUBLIC_SITE_URL` to the deployed origin so canonical and OG URLs are
correct.

**Performance** — the studio never requests the server-side PNG (see the `preview`
note above), which removes ~75 % of the response body and ~80 % of the server CPU
per conversion. `PixelCanvas`, `CraftPattern`, `PaletteStrip` and `DownloadMenu` are
memoised so zooming the canvas or opening the toast does not re-render them.
Requests are debounced and `AbortController` cancels superseded work.

## Deployment

### Frontend → Netlify

`netlify.toml` is committed and works as-is:

- base directory `frontend`, build command `npm run build`
- **Only `frontend/` is built.** The backend is a separate Render service and is
  never part of the Netlify build.
- **`publish` is deliberately not set.** Netlify runs Next.js through its OpenNext
  adapter with zero configuration and chooses the publish directory itself.
  Setting `publish = ".next"` manually breaks routing: Next's build output has no
  `index.html` at its root, so Netlify serves it as a plain static directory and
  `/` returns "Page not found". The build log prints the directory actually used
  — check it if the site misbehaves.
- There is no `[[plugins]]` block: Netlify runs Next.js through its OpenNext
  adapter with zero configuration, and pinning `@netlify/plugin-nextjs` opts out
  of adapter updates.

**Set these two variables in the Netlify UI**, *not* in `netlify.toml`:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://your-api.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://your-site.netlify.app` |

> **Site configuration → Environment variables**, then
> **Deploys → Clear cache and deploy site.**
>
> Do not put these in `netlify.toml`: **netlify.toml overrides the Netlify
> dashboard when the two conflict**, so a placeholder value there silently wins
> over whatever you set in the UI and the deployed bundle keeps pointing at the
> placeholder. Both values are inlined into the client bundle at build time, so
> changing them requires a rebuild, not just a restart.

To confirm which URL is actually deployed, view source on your site and search
the JS bundle for `localhost:8000` — if it is there, the wrong value was baked
in.

### Backend → Render (or any container host)

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `pip install --require-hashes -r requirements.lock` (see note) |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |
| Python version | **3.12** (or any ≥ 3.10, so the patched Pillow is used) |

> **`requirements.lock` and Python versions.** `pip-compile` resolves for the
> interpreter it runs under, so the lock must carry a hash set for *every*
> interpreter you deploy on. Pillow is pinned with environment markers
> (`python_version < "3.10"` → 11.3.0, `>= "3.10"` → 12.1.1), and a lock generated
> on 3.9 alone will silently skip Pillow on a 3.12 host — the build succeeds and
> the process then dies with `ModuleNotFoundError: No module named 'PIL'`.
> `tests/test_lockfile.py` fails the build if either branch goes missing.
>
> To regenerate after a dependency change, run `pip-compile` under **each**
> supported interpreter and merge the branches (see `backend/tools/`), or simply
> use `pip install -r requirements.txt` on the deploy target.

Environment variables to set:

| Variable | Purpose |
| --- | --- |
| `CORS_ORIGINS` | Your Netlify URL, e.g. `https://my-app.netlify.app`. **Required** — without it the API only accepts localhost origins and logs a warning. |
| `ENABLE_DOCS` | Set to `false` to remove `/docs`, `/redoc` and `/openapi.json`. |
| `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW` | Transform endpoint budget (default 20 requests / 60 s). |

Pillow needs no system packages, so the default Python image is enough.

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