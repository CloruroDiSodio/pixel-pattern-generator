"""Pillow powered image processing, colour quantization and matrix generation.

The public surface of this module is intentionally small:

* :class:`TransformOptions` / :class:`TransformResult` - plain data holders.
* :func:`transform_image` - turn an encoded image into a pixel grid + preview.
* :func:`build_pattern` - turn a pixel grid into a craft (cross stitch) chart.
* :func:`list_palettes` - expose the bundled palettes to the HTTP layer.

Every failure mode that can be triggered by user input raises
:class:`ProcessingError` so the API can turn it into a friendly ``400``.
"""

from __future__ import annotations

import base64
import io
import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

logger = logging.getLogger("app.processor")

from .utils import (
    MAX_COLORS,
    RGB,
    InvalidColorError,
    assign_symbols,
    clamp,
    grid_to_csv,
    grid_to_markdown,
    hex_to_rgb,
    nearest_color_index,
    normalize_hex,
    numbered_labels,
    parse_palette_string,
    relative_luminance,
    rgb_to_hex,
    stitch_counts,
    symbol_grid,
)

__all__ = [
    "ProcessingError",
    "TransformOptions",
    "TransformResult",
    "PatternResult",
    "PaletteColor",
    "transform_image",
    "build_pattern",
    "list_palettes",
    "MAX_IMAGE_BYTES",
    "MAX_GRID_SIZE",
    "MIN_GRID_SIZE",
    "RESIZE_MODES",
    "QUANTIZE_METHODS",
    "DITHER_MODES",
    "PALETTE_SORTS",
]

# --------------------------------------------------------------------------- #
# Limits & supported option values
# --------------------------------------------------------------------------- #

MAX_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB upload ceiling
MAX_SOURCE_PIXELS = 40_000_000  # decompression bomb guard
MIN_GRID_SIZE = 4
MAX_GRID_SIZE = 200
MAX_PREVIEW_SCALE = 40

RESIZE_MODES: Dict[str, int] = {
    # BOX averages every source pixel of a block: the classic "pixelate" look.
    "pixelate": Image.Resampling.BOX,
    # NEAREST keeps hard edges, ideal for flat pixel art sources.
    "sample": Image.Resampling.NEAREST,
    # LANCZOS gives a softer, more photographic pixelation.
    "smooth": Image.Resampling.LANCZOS,
}

QUANTIZE_METHODS: Dict[str, int] = {
    "mediancut": Image.Quantize.MEDIANCUT,
    "maxcoverage": Image.Quantize.MAXCOVERAGE,
    "fastoctree": Image.Quantize.FASTOCTREE,
    # Only available when Pillow is compiled with libimagequant support.
    "libimagequant": Image.Quantize.LIBIMAGEQUANT,
}

DITHER_MODES = ("none", "floyd_steinberg", "bayer")

PALETTE_SORTS = ("usage", "luminance", "hex")

#: Classic 4x4 Bayer threshold matrix, used for ordered dithering.
BAYER_4X4 = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)


class ProcessingError(ValueError):
    """Raised when an image (or an option) cannot be processed."""


# --------------------------------------------------------------------------- #
# Bundled palettes
# --------------------------------------------------------------------------- #

BUILT_IN_PALETTES: Dict[str, Dict[str, object]] = {
    "auto": {
        "name": "Automatic",
        "description": "Let Pillow build the palette from the image itself.",
        "colors": [],
    },
    "nes": {
        "name": "NES Classic",
        "description": "Curated 8-bit console colours (Nintendo Entertainment System).",
        "colors": [
            ("#000000", "Black"), ("#555555", "Dark Grey"), ("#AAAAAA", "Grey"),
            ("#FCFCFC", "White"), ("#880000", "Dark Red"), ("#AA0000", "Red"),
            ("#FF6666", "Light Red"), ("#AA5500", "Dark Yellow"), ("#FFDD00", "Yellow"),
            ("#FFFFAA", "Light Yellow"), ("#007700", "Dark Green"), ("#00AA00", "Green"),
            ("#55FF55", "Light Green"), ("#0000AA", "Dark Blue"), ("#5555FF", "Blue"),
            ("#55FFFF", "Light Blue"), ("#550055", "Dark Purple"), ("#AA00AA", "Purple"),
            ("#FF55FF", "Light Purple"), ("#A85400", "Dark Orange"), ("#FF9D00", "Orange"),
        ],
    },
    "pico8": {
        "name": "PICO-8",
        "description": "The 16 colour palette of the fantasy console PICO-8.",
        "colors": [
            ("#000000", "Black"), ("#1D2B53", "Dark Blue"), ("#7E2553", "Dark Purple"),
            ("#008751", "Dark Green"), ("#AB5236", "Brown"), ("#5F574F", "Dark Grey"),
            ("#C2C3C7", "Light Grey"), ("#FFF1E8", "White"), ("#FF004D", "Red"),
            ("#FFA300", "Orange"), ("#FFEC27", "Yellow"), ("#00E436", "Green"),
            ("#29ADFF", "Blue"), ("#83769C", "Lavender"), ("#FF77A8", "Pink"),
            ("#FFCCAA", "Peach"),
        ],
    },
    "gameboy": {
        "name": "Game Boy DMG",
        "description": "Four shades of olive green straight from 1989.",
        "colors": [
            ("#0F380F", "Darkest Green"), ("#306230", "Dark Green"),
            ("#8BAC0F", "Light Green"), ("#9BBC0F", "Lightest Green"),
        ],
    },
    "sweetie16": {
        "name": "Sweetie 16",
        "description": "A popular 16 colour palette for pixel art and RPG Maker.",
        "colors": [
            ("#1A1C2C", "Black Blue"), ("#5D275D", "Dark Purple"), ("#B13E53", "Dark Red"),
            ("#EF7D57", "Orange"), ("#FFCD75", "Sand"), ("#A7F070", "Light Green"),
            ("#38B764", "Green"), ("#257179", "Teal"), ("#29366F", "Dark Blue"),
            ("#3B5DC9", "Blue"), ("#41A6F6", "Light Blue"), ("#73EFF7", "Cyan"),
            ("#F4F4F4", "White"), ("#94B0C2", "Light Grey"), ("#566C86", "Grey Blue"),
            ("#333C57", "Dark Grey Blue"),
        ],
    },
    "cga": {
        "name": "CGA (1984)",
        "description": "The four colours of the IBM CGA display adapter.",
        "colors": [
            ("#000000", "Black"), ("#55FFFF", "Cyan"),
            ("#FF55FF", "Magenta"), ("#FFFFFF", "White"),
        ],
    },
    "grayscale": {
        "name": "Greyscale",
        "description": "Five neutral greys - perfect for embroidery on fabric.",
        "colors": [
            ("#000000", "Black"), ("#404040", "Dark Grey"),
            ("#808080", "Grey"), ("#BFBFBF", "Light Grey"), ("#FFFFFF", "White"),
        ],
    },
}


# --------------------------------------------------------------------------- #
# Data holders
# --------------------------------------------------------------------------- #


@dataclass
class PaletteColor:
    """A single entry of the generated (or selected) palette."""

    hex: str
    count: int = 0
    label: str = ""


@dataclass
class TransformOptions:
    """Every knob the UI can turn when generating a pixel grid."""

    grid_width: int = 32
    max_colors: int = 16
    resize_mode: str = "pixelate"
    quantize_method: str = "mediancut"
    dither: str = "none"
    palette: str = "auto"
    custom_palette: Optional[str] = None
    background: Optional[str] = None
    palette_sort: str = "usage"
    preview_scale: int = 16
    grid_lines: bool = True

    def validate(self) -> "TransformOptions":
        """Normalise and range-check the options, raising ``ProcessingError``."""

        self.grid_width = _as_int(self.grid_width, "grid_width", MIN_GRID_SIZE, MAX_GRID_SIZE)
        self.max_colors = _as_int(self.max_colors, "max_colors", 2, MAX_COLORS)
        self.preview_scale = _as_int(self.preview_scale, "preview_scale", 1, MAX_PREVIEW_SCALE)

        if self.resize_mode not in RESIZE_MODES:
            raise ProcessingError(
                f"unknown resize mode '{self.resize_mode}' (expected {', '.join(RESIZE_MODES)})"
            )
        if self.dither not in DITHER_MODES:
            raise ProcessingError(
                f"unknown dither mode '{self.dither}' (expected {', '.join(DITHER_MODES)})"
            )
        if self.palette_sort not in PALETTE_SORTS:
            raise ProcessingError(
                f"unknown palette sort '{self.palette_sort}' (expected {', '.join(PALETTE_SORTS)})"
            )
        if self.quantize_method not in QUANTIZE_METHODS:
            raise ProcessingError(
                f"unknown quantization method '{self.quantize_method}' "
                f"(expected {', '.join(QUANTIZE_METHODS)})"
            )
        if self.palette not in BUILT_IN_PALETTES and self.palette != "custom":
            raise ProcessingError(f"unknown palette '{self.palette}'")

        if self.palette == "custom" and not self.custom_palette:
            raise ProcessingError("a custom palette needs at least one colour")

        if self.custom_palette:
            try:
                self.custom_palette = ",".join(parse_palette_string(self.custom_palette))
            except InvalidColorError as error:
                raise ProcessingError(str(error)) from error

        if self.background:
            try:
                self.background = normalize_hex(self.background)
            except InvalidColorError as error:
                raise ProcessingError(str(error)) from error

        return self

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


@dataclass
class TransformResult:
    """Everything the frontend needs to render a pixel grid."""

    width: int
    height: int
    original_width: int
    original_height: int
    palette: List[PaletteColor]
    grid: List[List[int]]
    symbols: List[str]
    preview_png: str
    processing_ms: int
    settings: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return {
            "width": self.width,
            "height": self.height,
            "originalWidth": self.original_width,
            "originalHeight": self.original_height,
            "palette": [asdict(color) for color in self.palette],
            "grid": self.grid,
            "symbols": self.symbols,
            "previewPng": self.preview_png,
            "processingMs": self.processing_ms,
            "settings": self.settings,
        }


@dataclass
class PatternResult:
    """A cross-stitch / craft chart built from a pixel grid."""

    title: str
    width: int
    height: int
    repeat_x: int
    repeat_y: int
    total_stitches: int
    row_labels: List[str]
    column_labels: List[str]
    grid: List[List[str]]
    legend: List[Dict[str, object]]
    csv: str
    markdown: str

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


def _as_int(value: object, name: str, low: int, high: int) -> int:
    try:
        number = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as error:
        raise ProcessingError(f"'{name}' must be a whole number") from error
    if number < low or number > high:
        raise ProcessingError(f"'{name}' must be between {low} and {high}")
    return number


# --------------------------------------------------------------------------- #
# Palette helpers
# --------------------------------------------------------------------------- #


def list_palettes() -> List[Dict[str, object]]:
    """Return the bundled palettes in a JSON friendly shape."""

    palettes: List[Dict[str, object]] = []
    for identifier, palette in BUILT_IN_PALETTES.items():
        colors = [
            {"hex": color, "label": label}
            for color, label in palette["colors"]  # type: ignore[union-attr]
        ]
        palettes.append(
            {
                "id": identifier,
                "name": palette["name"],
                "description": palette["description"],
                "colors": colors,
            }
        )
    return palettes


def _resolve_palette(options: TransformOptions) -> Tuple[Optional[List[RGB]], List[str]]:
    """Return ``(colors, labels)`` for a fixed palette, or ``(None, [])``.

    ``None`` means "no palette constraint": let Pillow quantize automatically.
    """

    if options.palette == "custom" and options.custom_palette:
        hexes = options.custom_palette.split(",")
        return [hex_to_rgb(color) for color in hexes], [f"Custom {i + 1}" for i in range(len(hexes))]

    if options.palette in BUILT_IN_PALETTES and options.palette != "auto":
        entries = _select_palette_entries(
            BUILT_IN_PALETTES[options.palette]["colors"], options.max_colors
        )
        return (
            [hex_to_rgb(color) for color, _ in entries],  # type: ignore[misc]
            [label for _, label in entries],  # type: ignore[misc]
        )

    return None, []


def _select_palette_entries(entries: Sequence[Tuple[str, str]], max_colors: int) -> List[Tuple[str, str]]:
    """Reduce a preset palette to ``max_colors`` *representative* colours.

    Taking the first N entries would be wrong: every bundled palette is ordered
    dark-first, so ``PICO-8`` with 5 colours would collapse to five near-black
    swatches.  Instead the palette is sampled evenly across its luminance
    range, then restored to the original order so indexes and labels stay
    stable and predictable.
    """

    entries = list(entries)
    if len(entries) <= max_colors:
        return entries

    by_luminance = sorted(entries, key=lambda entry: relative_luminance(hex_to_rgb(entry[0])))
    step = len(by_luminance) / max_colors
    keep = {by_luminance[min(len(by_luminance) - 1, int(index * step))] for index in range(max_colors)}
    return [entry for entry in entries if entry in keep]


# --------------------------------------------------------------------------- #
# Image decoding / preparation
# --------------------------------------------------------------------------- #


#: Formats the service is willing to decode.
#:
#: Pillow can open far more than we want to hand to a public endpoint (PSD,
#: PCX, DDS, FITS, ...).  Some of those decoders have had memory-safety bugs -
#: CVE-2026-25990 is an out-of-bounds write while loading a crafted PSD, so the
#: file is rejected *before* ``load()`` ever decodes pixels.  An allowlist is
#: used instead of a blocklist so new Pillow decoders are safe by default.
ALLOWED_FORMATS = frozenset({"PNG", "JPEG", "GIF", "WEBP", "BMP", "TIFF"})

#: Human readable version of :data:`ALLOWED_FORMATS` for error messages.
ALLOWED_FORMATS_HELP = "PNG, JPEG, GIF, WEBP, BMP or TIFF"


def _open_image(data: bytes, background: Optional[RGB] = None) -> Image.Image:
    """Decode raw bytes into a fully loaded, EXIF-corrected RGB image.

    ``background`` is the colour transparent pixels are flattened onto - it
    defaults to white so PNG cut-outs do not turn into black blocks.
    """

    if not data:
        raise ProcessingError("the uploaded file is empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise ProcessingError(
            f"the image is too large (limit {MAX_IMAGE_BYTES // (1024 * 1024)} MB)"
        )

    Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
    # ``Image.open`` is lazy: it sniffs the header only.  The format is checked
    # between ``open`` and ``load`` so a decoder we did not ask for is never
    # invoked - not even on its header.
    #
    # The two try blocks are deliberately separate: ``ProcessingError`` derives
    # from ``ValueError``, so raising it inside the decode block would be caught
    # by that block's own ``except`` and re-wrapped as "could not decode".
    try:
        image = Image.open(io.BytesIO(data))
    except UnidentifiedImageError as error:
        raise ProcessingError(
            f"unsupported image format ({ALLOWED_FORMATS_HELP} are supported)"
        ) from error
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        raise ProcessingError(f"could not decode the image: {error}") from error

    detected = (image.format or "").upper()
    if detected not in ALLOWED_FORMATS:
        logger.warning(
            "rejected upload: unsupported format %r (allowed: %s)",
            detected or "unknown",
            sorted(ALLOWED_FORMATS),
        )
        raise ProcessingError(
            f"unsupported image format ({ALLOWED_FORMATS_HELP} are supported)"
        )

    try:
        image.load()
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        raise ProcessingError(f"could not decode the image: {error}") from error

    # Honour the EXIF orientation flag (phones store images sideways).
    image = ImageOps.exif_transpose(image) or image

    backdrop = background or (255, 255, 255)
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        image = image.convert("RGBA")
        canvas = Image.new("RGBA", image.size, backdrop + (255,))
        canvas.alpha_composite(image)
        image = canvas

    return image.convert("RGB")


def _prepare_image(image: Image.Image, options: TransformOptions) -> Tuple[Image.Image, int, int]:
    """Resize to the target grid while preserving the aspect ratio."""

    source_width, source_height = image.size
    if source_width == 0 or source_height == 0:
        raise ProcessingError("the image has no pixels")

    target_width = options.grid_width
    target_height = max(1, round(source_height * target_width / source_width))
    target_height = min(target_height, MAX_GRID_SIZE)
    target_width = min(target_width, MAX_GRID_SIZE)

    resized = image.resize((target_width, target_height), RESIZE_MODES[options.resize_mode])
    return resized, source_width, source_height


def apply_bayer_dither(image: Image.Image, strength: int = 32) -> Image.Image:
    """Apply ordered (Bayer 4x4) dithering to an RGB image.

    Pillow only ships Floyd-Steinberg style error diffusion, so ordered
    dithering is implemented here by nudging each channel with the classic
    threshold matrix.
    """

    pixels = image.load()
    width, height = image.size

    for y in range(height):
        row = BAYER_4X4[y % 4]
        for x in range(width):
            threshold = (row[x % 4] / 16.0 - 0.5) * strength
            red, green, blue = pixels[x, y][:3]
            pixels[x, y] = (
                clamp(red + threshold),
                clamp(green + threshold),
                clamp(blue + threshold),
            )

    return image


# --------------------------------------------------------------------------- #
# Quantization & grid extraction
# --------------------------------------------------------------------------- #


def _candidate_palette(image: Image.Image, options: TransformOptions) -> List[RGB]:
    """Return the candidate colours every pixel will be mapped onto.

    For a fixed palette (built-in or custom) this is simply that palette.  In
    automatic mode Pillow builds it with the requested quantization method -
    note that we only ask Pillow for the *palette*, the actual pixel mapping
    (and therefore the dithering) happens in :func:`_map_grid`.
    """

    fixed, _ = _resolve_palette(options)
    if fixed:
        return list(fixed)

    method = QUANTIZE_METHODS[options.quantize_method]
    try:
        quantized = image.quantize(colors=options.max_colors, method=method)
    except ValueError:
        # ``libimagequant`` may be missing or may reject very low colour counts.
        quantized = image.quantize(colors=options.max_colors)

    raw = quantized.getpalette() or []
    colors: List[RGB] = []
    for _, index in quantized.getcolors() or []:
        if index * 3 + 2 < len(raw):
            colors.append((raw[index * 3], raw[index * 3 + 1], raw[index * 3 + 2]))

    return colors or [(0, 0, 0)]


def _map_grid(
    image: Image.Image, colors: Sequence[RGB], dither: str = "none"
) -> List[List[int]]:
    """Snap every pixel onto the closest entry of ``colors``.

    ``Image.quantize(dither=...)`` silently ignores its ``dither`` argument and
    ``Image.convert("P", palette=...)`` *blends* colours instead of matching
    them, so both the matching and the dithering are implemented here:

    * ``none``            – plain nearest colour (redmean distance, cached).
    * ``floyd_steinberg`` – error diffusion, weights 7/16, 3/16, 5/16, 1/16.
    * ``bayer``           – ordered dithering via the 4x4 threshold matrix.
    """

    if not colors:
        raise ProcessingError("cannot map pixels onto an empty palette")

    width, height = image.size
    pixels = [tuple(pixel[:3]) for pixel in image.getdata()]
    grid: List[List[int]] = [[0] * width for _ in range(height)]

    cache: Dict[RGB, int] = {}

    def lookup(rgb: RGB) -> int:
        index = cache.get(rgb)
        if index is None:
            index = nearest_color_index(rgb, colors)
            cache[rgb] = index
        return index

    if dither == "bayer":
        pixels = list(apply_bayer_dither(image).getdata())

    if dither == "floyd_steinberg":
        # Error diffusion needs a mutable float working copy of the pixels.
        buffer = [[float(channel) for channel in pixel] for pixel in pixels]
        for y in range(height):
            for x in range(width):
                position = y * width + x
                red, green, blue = buffer[position]
                key = (clamp(red), clamp(green), clamp(blue))
                index = lookup(key)
                grid[y][x] = index

                target_red, target_green, target_blue = colors[index]
                errors = (
                    red - target_red,
                    green - target_green,
                    blue - target_blue,
                )
                # (dx, dy, weight) - right, below-left, below, below-right.
                neighbours = ((1, 0, 7.0), (-1, 1, 3.0), (0, 1, 5.0), (1, 1, 1.0))
                for offset_x, offset_y, weight in neighbours:
                    neighbour_x, neighbour_y = x + offset_x, y + offset_y
                    if not (0 <= neighbour_x < width and neighbour_y < height):
                        continue
                    slot = buffer[neighbour_y * width + neighbour_x]
                    for channel in range(3):
                        slot[channel] += errors[channel] * weight / 16.0

        return grid

    for y in range(height):
        offset = y * width
        row = grid[y]
        for x in range(width):
            row[x] = lookup(pixels[offset + x])

    return grid


def _build_palette(
    grid: Sequence[Sequence[int]],
    colors: Sequence[RGB],
    labels: Sequence[str],
    sort_mode: str,
) -> Tuple[List[PaletteColor], Dict[int, int]]:
    """Count palette usage, drop unused colours and order the result.

    Returns the compacted palette plus the ``original index -> new index`` map
    needed to rewrite the grid.
    """

    counts = stitch_counts(grid)
    entries = [
        (index, rgb_to_hex(colors[index]), counts.get(index, 0))
        for index in range(len(colors))
        if counts.get(index, 0) > 0
    ]

    if sort_mode == "usage":
        entries.sort(key=lambda entry: (-entry[2], entry[1]))
    elif sort_mode == "luminance":
        entries.sort(key=lambda entry: (relative_luminance(hex_to_rgb(entry[1])), -entry[2]))
    else:
        entries.sort(key=lambda entry: entry[1])

    palette: List[PaletteColor] = []
    remap: Dict[int, int] = {}
    for position, (original_index, color, count) in enumerate(entries):
        remap[original_index] = position
        label = labels[original_index] if original_index < len(labels) else ""
        palette.append(PaletteColor(hex=color, count=count, label=label or f"Colour {position + 1}"))

    return palette, remap


def _remap_grid(
    grid: Sequence[Sequence[int]], remap: Dict[int, int]
) -> List[List[int]]:
    """Rewrite a grid so its indexes point at the sorted, compacted palette."""

    return [[remap[index] for index in row] for row in grid]




def render_preview(
    grid: Sequence[Sequence[int]],
    palette: Sequence[str],
    scale: int = 16,
    grid_lines: bool = True,
) -> str:
    """Render the pixel grid as a base64 encoded PNG data URI."""

    height = len(grid)
    width = len(grid[0]) if height else 0
    if width == 0 or height == 0:
        raise ProcessingError("cannot render an empty grid")

    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y, row in enumerate(grid):
        for x, index in enumerate(row):
            pixels[x, y] = hex_to_rgb(palette[index])

    image = image.resize((width * scale, height * scale), Image.Resampling.NEAREST)

    if grid_lines and scale >= 4:
        draw = ImageDraw.Draw(image, "RGBA")
        for x in range(width + 1):
            major = x % 10 == 0
            draw.line(
                [(x * scale, 0), (x * scale, height * scale)],
                fill=(0, 0, 0, 120 if major else 55),
                width=2 if major else 1,
            )
        for y in range(height + 1):
            major = y % 10 == 0
            draw.line(
                [(0, y * scale), (width * scale, y * scale)],
                fill=(0, 0, 0, 120 if major else 55),
                width=2 if major else 1,
            )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


# --------------------------------------------------------------------------- #
# Public API of the processor
# --------------------------------------------------------------------------- #


def transform_image(data: bytes, options: Optional[TransformOptions] = None) -> TransformResult:
    """Turn encoded image bytes into a pixel grid, palette and PNG preview."""

    started = time.perf_counter()
    resolved = (options or TransformOptions()).validate()

    background = hex_to_rgb(resolved.background) if resolved.background else None
    image = _open_image(data, background)
    resized, source_width, source_height = _prepare_image(image, resolved)

    colors, labels = _resolve_palette(resolved)
    candidates = list(colors) if colors else _candidate_palette(resized, resolved)

    mapped = _map_grid(resized, candidates, resolved.dither)
    palette, remap = _build_palette(mapped, candidates, labels, resolved.palette_sort)
    grid = _remap_grid(mapped, remap)

    if not palette:
        raise ProcessingError("quantization produced no colours - try a smaller colour count")

    hexes = [color.hex for color in palette]
    symbols = assign_symbols(hexes)
    preview_png = render_preview(grid, hexes, resolved.preview_scale, resolved.grid_lines)

    return TransformResult(
        width=len(grid[0]),
        height=len(grid),
        original_width=source_width,
        original_height=source_height,
        palette=palette,
        grid=grid,
        symbols=symbols,
        preview_png=preview_png,
        processing_ms=int(round((time.perf_counter() - started) * 1000)),
        settings=resolved.to_dict(),
    )


def build_pattern(
    grid: Sequence[Sequence[int]],
    palette: Sequence[PaletteColor],
    symbols: Optional[Sequence[str]] = None,
    title: str = "Pixel pattern",
    repeat_x: int = 1,
    repeat_y: int = 1,
) -> PatternResult:
    """Build a craft (cross stitch) chart from an already generated pixel grid."""

    if not grid or not grid[0]:
        raise ProcessingError("the pattern grid is empty")

    width = len(grid[0])
    height = len(grid)
    if any(len(row) != width for row in grid):
        raise ProcessingError("every row of the pattern grid must have the same length")

    for row in grid:
        for index in row:
            if not 0 <= index < len(palette):
                raise ProcessingError(f"grid references palette index {index} which does not exist")

    repeat_x = _as_int(repeat_x, "repeat_x", 1, 20)
    repeat_y = _as_int(repeat_y, "repeat_y", 1, 20)

    chart_symbols = list(symbols) if symbols else assign_symbols([c.hex for c in palette])
    if len(chart_symbols) < len(palette):
        raise ProcessingError("not enough symbols to label the palette")

    hexes = [color.hex for color in palette]
    labels = [color.label for color in palette]
    total_stitches = width * height * repeat_x * repeat_y

    legend: List[Dict[str, object]] = []
    counts: Dict[int, int] = {}
    for row in grid:
        for index in row:
            counts[index] = counts.get(index, 0) + 1

    for position, color in enumerate(palette):
        stitches = counts.get(position, 0) * repeat_x * repeat_y
        legend.append(
            {
                "index": position,
                "hex": color.hex,
                "label": color.label,
                "symbol": chart_symbols[position],
                "count": stitches,
                "percent": round((stitches / max(1, total_stitches)) * 100, 2),
            }
        )

    return PatternResult(
        title=title,
        width=width,
        height=height,
        repeat_x=repeat_x,
        repeat_y=repeat_y,
        total_stitches=total_stitches,
        row_labels=numbered_labels(height),
        column_labels=numbered_labels(width),
        grid=symbol_grid(grid, chart_symbols),
        legend=legend,
        csv=grid_to_csv(grid, hexes, labels, chart_symbols, title, repeat_x, repeat_y),
        markdown=grid_to_markdown(grid, hexes, labels, chart_symbols, title, repeat_x, repeat_y),
    )





