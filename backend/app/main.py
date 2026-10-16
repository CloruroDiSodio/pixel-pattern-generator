"""FastAPI application exposing the pixel-art processing service.

Routes
------
``GET  /``                service banner
``GET  /api/health``      liveness probe used by the frontend and by Render
``GET  /api/options``     the enum values + limits the UI builds its controls from
``GET  /api/palettes``    the bundled palettes (NES, PICO-8, Game Boy, ...)
``POST /api/transform``   multipart image upload -> pixel grid + preview PNG
``POST /api/pattern``     pixel grid -> cross stitch chart (CSV + Markdown)
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque
from typing import Annotated, Any, Deque, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from . import __version__
from .processor import (
    CLEANUP_MODES,
    DITHER_MODES,
    MAX_COLORS,
    MAX_GRID_SIZE,
    MAX_IMAGE_BYTES,
    MAX_PREVIEW_SCALE,
    MIN_GRID_SIZE,
    PALETTE_SORTS,
    QUANTIZE_METHODS,
    RESIZE_MODES,
    PaletteColor,
    ProcessingError,
    TransformOptions,
    build_pattern,
    list_palettes,
    transform_image,
)
from .threads import list_thread_brands
from .utils import DEFAULT_SYMBOLS, normalize_hex

logger = logging.getLogger("app.security")

#: Origins allowed when ``CORS_ORIGINS`` is not configured.  Deliberately
#: localhost-only: an open ``*`` default would let any site drive the API from a
#: visitor's browser.  Set ``CORS_ORIGINS`` explicitly in production.
DEFAULT_CORS_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")

#: Sliding-window rate limit for the expensive transform endpoint.
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "20"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # seconds

#: ``/docs`` and ``/redoc`` are a needless information disclosure in production.
DOCS_ENABLED = os.getenv("ENABLE_DOCS", "true").strip().lower() not in {"0", "false", "no"}

#: Number of reverse proxies in front of the app that *append* to
#: ``X-Forwarded-For`` (Render's load balancer is one).  The client address is
#: read that many entries from the right; ``0`` ignores the header entirely.
TRUSTED_PROXY_COUNT = max(0, int(os.getenv("TRUSTED_PROXY_COUNT", "1")))

#: Above this many tracked clients, idle buckets are swept so a flood of
#: distinct addresses cannot grow the table without bound.
RATE_BUCKET_SWEEP_THRESHOLD = 10_000

# client IP -> timestamps of recent requests (sliding window).
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Best-effort client identity for rate limiting and audit logs.

    ``X-Forwarded-For`` is read from the *right*: every entry left of the ones
    our own proxies appended is whatever the client chose to send, so trusting
    the left-most value would let anyone dodge the rate limit by rotating a
    fake address per request.
    """

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and TRUSTED_PROXY_COUNT:
        hops = [part.strip() for part in forwarded.split(",") if part.strip()]
        if len(hops) >= TRUSTED_PROXY_COUNT:
            return hops[-TRUSTED_PROXY_COUNT]
    return request.client.host if request.client else "unknown"


def _sweep_rate_buckets(now: float) -> None:
    """Drop the buckets whose newest request has left the window."""

    stale = [key for key, bucket in _rate_buckets.items() if not bucket or now - bucket[-1] > RATE_LIMIT_WINDOW]
    for key in stale:
        del _rate_buckets[key]


def check_rate_limit(request: Request) -> Optional[int]:
    """Sliding-window rate limiter; returns ``Retry-After`` seconds when limited.

    In-memory and therefore per-process: with several uvicorn workers each one
    keeps its own bucket.  That is acceptable as a baseline, but a shared store
    (or an edge/CDN rule) is needed for a hard global limit - see the README.
    """

    now = time.monotonic()
    if len(_rate_buckets) > RATE_BUCKET_SWEEP_THRESHOLD:
        _sweep_rate_buckets(now)
    bucket = _rate_buckets[_client_ip(request)]
    while bucket and now - bucket[0] > RATE_LIMIT_WINDOW:
        bucket.popleft()

    if len(bucket) >= RATE_LIMIT_REQUESTS:
        retry_after = int(RATE_LIMIT_WINDOW - (now - bucket[0])) + 1
        logger.warning(
            "rate limit exceeded for %s (%d requests / %ds)", _client_ip(request), len(bucket), RATE_LIMIT_WINDOW
        )
        return max(retry_after, 1)

    bucket.append(now)
    return None


def _cors_origins() -> List[str]:
    """Read the allowed origins from ``CORS_ORIGINS`` (comma separated)."""

    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        logger.warning(
            "CORS_ORIGINS is not set - falling back to the localhost defaults. "
            "Set it to your deployed front-end origin in production."
        )
        return list(DEFAULT_CORS_ORIGINS)
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or list(DEFAULT_CORS_ORIGINS)


app = FastAPI(
    title="Pixel Art & Pattern Generator API",
    version=__version__,
    description=(
        "Turns uploaded images into pixel art grids and cross stitch / craft "
        "patterns. Heavy lifting (resizing, quantization, dithering, matrix "
        "generation) happens here with Pillow."
    ),
    # Disabled in production: the schema is a free reconnaissance tool.
    docs_url="/docs" if DOCS_ENABLED else None,
    redoc_url="/redoc" if DOCS_ENABLED else None,
    openapi_url="/openapi.json" if DOCS_ENABLED else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Grids, CSV and Markdown are highly repetitive JSON: a 200x200 transform shrinks
# by roughly 90 % on the wire, which matters on the free-tier hosts this targets.
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def security_headers(request: Request, call_next: Any) -> Any:
    """Attach conservative security headers and surface unhandled failures safely."""

    try:
        response = await call_next(request)
    except Exception:
        # Never leak a stack trace or internal path to the client.
        logger.exception("unhandled error while serving %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class PaletteColorModel(BaseModel):
    """A colour of the generated palette."""

    hex: str
    count: int = Field(default=0, ge=0)
    label: str = Field(default="", max_length=64)

    @field_validator("hex")
    @classmethod
    def _valid_hex(cls, value: str) -> str:
        # Rejected here (422) rather than deep inside thread matching, where an
        # unparseable colour used to surface as a 500.
        return normalize_hex(value)


#: One printable character per chart cell.  Whitespace, backticks, pipes and
#: backslashes would break the Markdown table the symbol is written into.
ChartSymbol = Annotated[str, StringConstraints(min_length=1, max_length=1, pattern=r"^[^\s`|\\]$")]


class TransformResponse(BaseModel):
    width: int
    height: int
    originalWidth: int
    originalHeight: int
    palette: List[PaletteColorModel]
    grid: List[List[int]]
    symbols: List[str]
    processingMs: int
    settings: Dict[str, Any]
    #: Only present when the request asked for it with ``preview=true``. The
    #: browser draws its own canvas from ``grid`` + ``palette``, so shipping a
    #: base64 PNG on every request would be pure overhead.
    previewPng: Optional[str] = None


class PaletteInfoModel(BaseModel):
    id: str
    name: str
    description: str
    colors: List[PaletteColorModel]


class PalettesResponse(BaseModel):
    palettes: List[PaletteInfoModel]
    symbols: List[str]


class OptionsResponse(BaseModel):
    resizeModes: List[str]
    quantizeMethods: List[str]
    ditherModes: List[str]
    cleanupModes: List[str]
    paletteSorts: List[str]
    symbols: List[str]
    #: Thread brands the legend can be matched against.  ``"none"`` is implicit -
    #: it is the absence of a brand, not a table.
    threadBrands: List[Dict[str, Any]]
    limits: Dict[str, int]
    defaults: Dict[str, Any]


class PatternRequest(BaseModel):
    """Payload for ``POST /api/pattern`` (camelCase or snake_case accepted)."""

    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(default="Pixel pattern", max_length=120)
    #: Bounded like a transform result: the chart, CSV and Markdown all grow with
    #: the grid, so an unbounded one turns a small request into a huge response.
    grid: List[List[int]] = Field(..., max_length=MAX_GRID_SIZE, description="Matrix of palette indexes")
    palette: List[PaletteColorModel] = Field(..., min_length=1, max_length=MAX_COLORS)
    symbols: Optional[List[ChartSymbol]] = Field(default=None, max_length=MAX_COLORS)
    repeat_x: int = Field(default=1, alias="repeatX", ge=1, le=20)
    repeat_y: int = Field(default=1, alias="repeatY", ge=1, le=20)
    #: Match every palette colour onto a thread brand's table.  Optional: with no
    #: brand the legend, CSV and Markdown are exactly what they were before.
    thread_brand: str = Field(default="none", alias="threadBrand", max_length=32)
    #: Fabric count the skein estimate assumes; an assumption worth stating rather
    #: than hiding, because the same skein covers twice as many stitches on 28
    #: count as on 14.
    fabric_count: int = Field(default=14, alias="fabricCount", ge=6, le=40)


class PatternThreadModel(BaseModel):
    """The brand's thread recommended for one palette colour."""

    brand: str
    code: str
    name: str
    hex: str
    #: Whole skeins to buy, including the waste allowance.  ``0`` for a colour
    #: that ended up with no stitches.
    skeins: int


class PatternLegendEntry(BaseModel):
    index: int
    hex: str
    label: str
    symbol: str
    count: int
    percent: float
    #: ``None`` when no thread brand was requested.
    thread: Optional[PatternThreadModel] = None


class PatternResponse(BaseModel):
    title: str
    width: int
    height: int
    repeatX: int
    repeatY: int
    totalStitches: int
    rowLabels: List[str]
    columnLabels: List[str]
    grid: List[List[str]]
    legend: List[PatternLegendEntry]
    csv: str
    markdown: str
    threadBrand: str
    fabricCount: int
    #: ``null`` when no brand is selected - there is nothing to estimate against.
    stitchesPerSkein: Optional[int] = None


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #


@app.get("/", tags=["meta"])
def read_root() -> Dict[str, str]:
    banner = {
        "service": "Pixel Art & Pattern Generator API",
        "version": __version__,
        "health": "/api/health",
    }
    # Only advertise the docs when they are actually served.
    if DOCS_ENABLED:
        banner["docs"] = "/docs"
    return banner


@app.get("/api/health", tags=["meta"])
def health() -> Dict[str, Any]:
    """Liveness probe - also used by the frontend to detect a sleeping backend."""

    return {"status": "ok", "version": __version__}


@app.get("/api/options", response_model=OptionsResponse, tags=["meta"])
def options() -> OptionsResponse:
    """Expose the supported option values and hard limits to the UI."""

    return OptionsResponse(
        resizeModes=list(RESIZE_MODES),
        quantizeMethods=list(QUANTIZE_METHODS),
        ditherModes=list(DITHER_MODES),
        cleanupModes=list(CLEANUP_MODES),
        paletteSorts=list(PALETTE_SORTS),
        symbols=list(DEFAULT_SYMBOLS),
        threadBrands=list_thread_brands(),
        limits={
            "minGridSize": MIN_GRID_SIZE,
            "maxGridSize": MAX_GRID_SIZE,
            "maxColors": MAX_COLORS,
            "maxPreviewScale": MAX_PREVIEW_SCALE,
            "maxImageBytes": MAX_IMAGE_BYTES,
        },
        defaults=TransformOptions().to_dict(),
    )


@app.get("/api/palettes", response_model=PalettesResponse, tags=["palettes"])
def palettes() -> PalettesResponse:
    """Return the bundled palettes so the UI can offer one-click presets."""

    return PalettesResponse(
        palettes=[PaletteInfoModel(**palette) for palette in list_palettes()],
        symbols=list(DEFAULT_SYMBOLS),
    )


@app.post(
    "/api/transform",
    response_model=TransformResponse,
    # Drops ``previewPng`` entirely when it was not rendered, rather than
    # emitting `"previewPng": null`` for every response.
    response_model_exclude_none=True,
    tags=["transform"],
)
async def transform(
    file: Annotated[UploadFile, File(description="Image to pixelate (PNG, JPEG, GIF, BMP, WEBP, TIFF)")],
    grid_width: Annotated[
        int, Form(alias="gridWidth", ge=MIN_GRID_SIZE, le=MAX_GRID_SIZE)
    ] = 32,
    max_colors: Annotated[int, Form(alias="maxColors", ge=2, le=MAX_COLORS)] = 16,
    resize_mode: Annotated[str, Form(alias="resizeMode")] = "crisp",
    quantize_method: Annotated[str, Form(alias="quantizeMethod")] = "mediancut",
    dither: Annotated[str, Form()] = "none",
    dither_strength: Annotated[int, Form(alias="ditherStrength", ge=0, le=100)] = 100,
    cleanup: Annotated[str, Form()] = "light",
    palette: Annotated[str, Form()] = "auto",
    custom_palette: Annotated[Optional[str], Form(alias="customPalette")] = None,
    background: Annotated[Optional[str], Form()] = None,
    palette_sort: Annotated[str, Form(alias="paletteSort")] = "usage",
    preview_scale: Annotated[
        int, Form(alias="previewScale", ge=1, le=MAX_PREVIEW_SCALE)
    ] = 16,
    grid_lines: Annotated[bool, Form(alias="gridLines")] = True,
    preview: Annotated[bool, Form()] = False,
    # Declared after the defaulted form fields, hence the None default.
    request: Request = None,  # type: ignore[assignment]
) -> TransformResponse:
    """Pixelate an uploaded image and return the grid, palette and preview PNG.

    Options travel as ``multipart/form-data`` fields in camelCase; anything
    omitted falls back to the default shown above.
    """

    # The transform endpoint is the expensive one (resize + quantize + dither),
    # so it is the one that gets rate limited.
    if request is not None:
        retry_after = check_rate_limit(request)
        if retry_after is not None:
            raise HTTPException(
                status_code=429,
                detail="too many requests - please wait a moment before generating another pattern",
                headers={"Retry-After": str(retry_after)},
            )

    request_options = TransformOptions(
        grid_width=grid_width,
        max_colors=max_colors,
        resize_mode=resize_mode,
        quantize_method=quantize_method,
        dither=dither,
        dither_strength=dither_strength,
        cleanup=cleanup,
        palette=palette,
        custom_palette=custom_palette,
        background=background,
        palette_sort=palette_sort,
        preview_scale=preview_scale,
        grid_lines=grid_lines,
        preview=preview,
    )

    # One byte past the limit is enough for the processor to reject it - there is
    # no reason to pull an arbitrarily large upload into memory first.
    data = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        # Decoding, quantizing and dithering are CPU-bound; run them off the
        # event loop so one slow image does not stall every other request
        # (including the health probe the frontend polls).
        result = await run_in_threadpool(transform_image, data, request_options)
    except ProcessingError as error:
        logger.warning(
            "rejected transform request from %s: %s", _client_ip(request), error
        )
        raise HTTPException(status_code=400, detail=str(error)) from error

    return TransformResponse(**result.to_dict())


@app.post("/api/pattern", response_model=PatternResponse, tags=["pattern"])
def pattern(payload: PatternRequest) -> PatternResponse:
    """Turn a pixel grid into a printable cross stitch chart."""

    palette = [
        PaletteColor(hex=color.hex, count=color.count, label=color.label)
        for color in payload.palette
    ]

    try:
        result = build_pattern(
            grid=payload.grid,
            palette=palette,
            symbols=payload.symbols,
            title=payload.title,
            repeat_x=payload.repeat_x,
            repeat_y=payload.repeat_y,
            thread_brand=payload.thread_brand,
            fabric_count=payload.fabric_count,
        )
    except ProcessingError as error:
        logger.warning("rejected pattern request: %s", error)
        raise HTTPException(status_code=400, detail=str(error)) from error

    return PatternResponse(
        title=result.title,
        width=result.width,
        height=result.height,
        repeatX=result.repeat_x,
        repeatY=result.repeat_y,
        totalStitches=result.total_stitches,
        rowLabels=result.row_labels,
        columnLabels=result.column_labels,
        grid=result.grid,
        legend=result.legend,  # type: ignore[arg-type]
        csv=result.csv,
        markdown=result.markdown,
        threadBrand=result.thread_brand,
        fabricCount=result.fabric_count,
        stitchesPerSkein=result.stitches_per_skein,
    )


if __name__ == "__main__":  # pragma: no cover - convenience for `python -m app.main`
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=bool(os.getenv("RELOAD", "")),
    )

