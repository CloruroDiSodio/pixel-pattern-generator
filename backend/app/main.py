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

import os
from typing import Annotated, Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from . import __version__
from .processor import (
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
from .utils import DEFAULT_SYMBOLS


def _cors_origins() -> List[str]:
    """Read the allowed origins from ``CORS_ORIGINS`` (comma separated)."""

    raw = os.getenv("CORS_ORIGINS", "*").strip()
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["*"]


app = FastAPI(
    title="Pixel Art & Pattern Generator API",
    version=__version__,
    description=(
        "Turns uploaded images into pixel art grids and cross stitch / craft "
        "patterns. Heavy lifting (resizing, quantization, dithering, matrix "
        "generation) happens here with Pillow."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class PaletteColorModel(BaseModel):
    """A colour of the generated palette."""

    hex: str
    count: int = 0
    label: str = ""


class TransformResponse(BaseModel):
    width: int
    height: int
    originalWidth: int
    originalHeight: int
    palette: List[PaletteColorModel]
    grid: List[List[int]]
    symbols: List[str]
    previewPng: str
    processingMs: int
    settings: Dict[str, Any]


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
    paletteSorts: List[str]
    symbols: List[str]
    limits: Dict[str, int]
    defaults: Dict[str, Any]


class PatternRequest(BaseModel):
    """Payload for ``POST /api/pattern`` (camelCase or snake_case accepted)."""

    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(default="Pixel pattern", max_length=120)
    grid: List[List[int]] = Field(..., description="Matrix of palette indexes")
    palette: List[PaletteColorModel] = Field(..., min_length=1, max_length=MAX_COLORS)
    symbols: Optional[List[str]] = None
    repeat_x: int = Field(default=1, alias="repeatX", ge=1, le=20)
    repeat_y: int = Field(default=1, alias="repeatY", ge=1, le=20)


class PatternLegendEntry(BaseModel):
    index: int
    hex: str
    label: str
    symbol: str
    count: int
    percent: float


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


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #


@app.get("/", tags=["meta"])
def read_root() -> Dict[str, str]:
    return {
        "service": "Pixel Art & Pattern Generator API",
        "version": __version__,
        "docs": "/docs",
        "health": "/api/health",
    }


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
        paletteSorts=list(PALETTE_SORTS),
        symbols=list(DEFAULT_SYMBOLS),
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


@app.post("/api/transform", response_model=TransformResponse, tags=["transform"])
async def transform(
    file: Annotated[UploadFile, File(description="Image to pixelate (PNG, JPEG, GIF, BMP, WEBP, TIFF)")],
    grid_width: Annotated[
        int, Form(alias="gridWidth", ge=MIN_GRID_SIZE, le=MAX_GRID_SIZE)
    ] = 32,
    max_colors: Annotated[int, Form(alias="maxColors", ge=2, le=MAX_COLORS)] = 16,
    resize_mode: Annotated[str, Form(alias="resizeMode")] = "pixelate",
    quantize_method: Annotated[str, Form(alias="quantizeMethod")] = "mediancut",
    dither: Annotated[str, Form()] = "none",
    palette: Annotated[str, Form()] = "auto",
    custom_palette: Annotated[Optional[str], Form(alias="customPalette")] = None,
    background: Annotated[Optional[str], Form()] = None,
    palette_sort: Annotated[str, Form(alias="paletteSort")] = "usage",
    preview_scale: Annotated[
        int, Form(alias="previewScale", ge=1, le=MAX_PREVIEW_SCALE)
    ] = 16,
    grid_lines: Annotated[bool, Form(alias="gridLines")] = True,
) -> TransformResponse:
    """Pixelate an uploaded image and return the grid, palette and preview PNG.

    Options travel as ``multipart/form-data`` fields in camelCase; anything
    omitted falls back to the default shown above.
    """

    request_options = TransformOptions(
        grid_width=grid_width,
        max_colors=max_colors,
        resize_mode=resize_mode,
        quantize_method=quantize_method,
        dither=dither,
        palette=palette,
        custom_palette=custom_palette,
        background=background,
        palette_sort=palette_sort,
        preview_scale=preview_scale,
        grid_lines=grid_lines,
    )

    data = await file.read()
    try:
        result = transform_image(data, request_options)
    except ProcessingError as error:
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
        )
    except ProcessingError as error:
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
    )


if __name__ == "__main__":  # pragma: no cover - convenience for `python -m app.main`
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=bool(os.getenv("RELOAD", "")),
    )

