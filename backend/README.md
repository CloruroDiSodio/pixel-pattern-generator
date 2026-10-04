# Backend — Pixel Art & Pattern Generator API

FastAPI + Pillow service that turns uploaded images into pixel art grids and craft
patterns. It owns all of the expensive work: decoding, resampling, colour
quantization, dithering, matrix generation and PNG rendering.

## Layout

```text
backend/
├── app/
│   ├── __init__.py     # package metadata
│   ├── main.py         # FastAPI app, routes, Pydantic schemas, CORS
│   ├── processor.py    # Pillow pipeline + bundled palettes + pattern building
│   ├── threads.py      # DMC colour table, nearest-thread match, skein estimate
│   └── utils.py        # pure helpers: colour maths, CSV/Markdown serialisation
├── tests/
│   ├── conftest.py         # deterministic sample-image fixtures
│   ├── test_utils.py       # 40 tests — colour maths, parsing, serialisation
│   ├── test_processor.py   # 91 tests — pipeline, dithering, palettes, patterns
│   ├── test_api.py         # 68 tests — every route, status codes, CORS, hardening
│   ├── test_threads.py     # 159 tests — the DMC table, matching, skein maths
│   └── test_lockfile.py    #   8 tests — lock file stays deployable
├── pytest.ini
├── requirements.txt     # runtime deps
└── requirements-dev.txt # + pytest, pytest-cov, httpx
```

`utils.py` deliberately imports neither Pillow nor FastAPI, so the colour maths and
the pattern serialisation can be tested (and reused) in isolation. `threads.py`
follows the same rule, and `utils` does **not** import it — the dependency points
one way (`processor → threads → utils`) so both stay free of the web stack.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Requires **Python 3.9+**.

## Run

```bash
uvicorn app.main:app --reload --port 8000
# or
python -m app.main           # honours HOST / PORT / RELOAD env vars
```

Keep this running in its own terminal — the Next.js front-end (`../frontend`, port
3000) is a separate process that calls this API. See the
[root README](../README.md#quick-start) for the full two-terminal walkthrough.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address (`python -m app.main` only) |
| `PORT` | `8000` | Bind port (`python -m app.main` only) |
| `RELOAD` | – | Any value enables auto-reload |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins. **Set this in production** — a warning is logged while it is unset. |
| `ENABLE_DOCS` | `true` | Set `false` to remove `/docs`, `/redoc` and `/openapi.json`. |
| `RATE_LIMIT_REQUESTS` | `20` | Transform requests allowed per window, per client. |
| `RATE_LIMIT_WINDOW` | `60` | Rate limit window in seconds. |

## Test

```bash
pytest                                   # 366 tests
pytest --cov=app --cov-report=term-missing
```

Current coverage: **98 %** (`app/main.py` 98 %, `app/processor.py` 97 %,
`app/threads.py` 100 %, `app/utils.py` 98 %).

## Endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Service banner |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/options` | Enum values, thread brands, limits and defaults |
| `GET` | `/api/palettes` | Bundled palettes (incl. DMC) + chart symbols |
| `POST` | `/api/transform` | Image upload → grid, palette, preview PNG |
| `POST` | `/api/pattern` | Grid → cross-stitch chart (CSV + Markdown), optional thread matching |

Full interactive reference: <http://localhost:8000/docs>.

See the [root README](../README.md#api) for the field-by-field reference.

### Example

```bash
curl -X POST http://localhost:8000/api/transform \
  -F 'file=@photo.png' \
  -F 'gridWidth=32' \
  -F 'maxColors=6' \
  -F 'dither=floyd_steinberg' \
  -F 'palette=gameboy' \
  -F 'paletteSort=usage' \
  -F 'previewScale=16' \
  -F 'gridLines=true'
```

```bash
curl -X POST http://localhost:8000/api/pattern \
  -H 'Content-Type: application/json' \
  -d '{"title":"Mushroom","grid":[[0,1],[1,0]],"palette":[{"hex":"#000000","label":"Black"}]}'
```

Matching onto a real thread table is one extra field:

```bash
curl -X POST http://localhost:8000/api/pattern \
  -H 'Content-Type: application/json' \
  -d '{"title":"Mushroom","grid":[[0,1],[1,0]],"palette":[{"hex":"#000000","label":"Black"},{"hex":"#F0C820","label":"Gold"}],"threadBrand":"dmc","fabricCount":14}'
```

## Limits

| Limit | Value |
| --- | --- |
| Upload size | 15 MB |
| Source pixels | 40 MP (decompression-bomb guard) |
| Accepted formats | PNG, JPEG, GIF, WEBP, BMP, TIFF (allowlist, checked before decoding) |
| Grid width | 4–200 cells |
| Palette size | 2–40 colours (40 chart symbols) |
| Preview scale | 1–40 px per cell |
| Pattern repeats | 1–20 per axis |
| Thread brands | `none` (default), `dmc` |
| Fabric count (`/api/pattern`) | 6–40 stitches per inch, default 14 |
| Transform rate limit | 20 requests / 60 s per client |

Every user-triggerable failure raises `ProcessingError`, which the HTTP layer turns
into a `400` with a human-readable message; out-of-range numbers are rejected by
Pydantic with a `422`. `threads.py` raises its own `ThreadError` — it cannot import
`ProcessingError` without creating an import cycle — and `build_pattern` translates
it, so the HTTP layer still sees exactly one failure type.

See the root [Security section](../README.md#security) for the OWASP Top 10
breakdown, the image-format allowlist rationale and the known limitations.

## Notes on Pillow behaviour

Two Pillow APIs look like they do what we need but don't, which shaped the design:

- `Image.quantize(colors=…, dither=…)` **ignores** `dither` — the output is identical
  for `NONE` and `FLOYDSTEINBERG`.
- `Image.convert("P", palette=…)` **blends** towards the palette instead of snapping
  to the nearest entry.

So `processor._map_grid` implements nearest-colour matching (redmean distance, cached
per unique colour) and Floyd–Steinberg error diffusion / Bayer ordered dithering
itself. Pillow is still used to *build* the candidate palette and to decode/resize
the image.

## Colour-count and presets

`maxColors` applies to presets too, so PICO-8 can be rendered with 5 colours. The
subset is **sampled evenly across the palette's luminance range** rather than sliced
from the front — every bundled palette is ordered dark-first, so a naive "first N"
slice would hand back five near-black swatches and flatten the image to a single
colour. The surviving entries keep their original order, so palette indexes and
colour labels stay stable.

## Security controls

| Control | Env var | Default |
| --- | --- | --- |
| Origin allowlist | `CORS_ORIGINS` | `http://localhost:3000` (localhost only — set it in production) |
| API docs | `ENABLE_DOCS` | `true` (set `false` in production) |
| Transform rate limit | `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW` | `20` requests / `60` s per client |

Uploads are decoded from an allowlist of formats and rejected **before** any pixel
data is decoded — see the root [Security section](../README.md#security).

## Locked installs

`requirements.lock` is generated with `pip-compile --generate-hashes`, but
`pip-compile` resolves for the interpreter it runs under. Because Pillow is pinned
with environment markers, the lock needs a branch per supported Python version or a
matching host silently skips it (`ModuleNotFoundError: No module named 'PIL'`).

`tests/test_lockfile.py` guards this invariant. `backend/tools/` holds the helpers
used to add and verify the extra branch:

```bash
python tools/add_pillow_branch.py     # insert the Pillow >= 3.10 hashes
python tools/verify_pillow_branch.py # check a downloaded wheel is hash-pinned
```

## Deploying to Render

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |

Set `CORS_ORIGINS` to the deployed front-end origin.