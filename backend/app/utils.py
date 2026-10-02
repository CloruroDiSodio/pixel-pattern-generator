"""Pure helper functions shared by the processor and the HTTP layer.

Nothing in this module imports Pillow or FastAPI.  Keeping the colour maths
and the pattern serialisation free of third-party dependencies makes them
trivial to unit test and lets them be reused by other entry points (CLI tools,
batch jobs, ...) without dragging in the whole service.
"""

from __future__ import annotations

import csv
import io
import math
from typing import Dict, List, Sequence, Tuple

RGB = Tuple[int, int, int]

#: Symbols used to represent colours inside a craft pattern chart.  The set
#: deliberately avoids characters that are easy to confuse (``0``/``O``,
#: ``1``/``l``/``I``) so that printed patterns stay readable.
DEFAULT_SYMBOLS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789$*+=%@"

#: Upper bound of colours a single pattern may use (matches ``DEFAULT_SYMBOLS``).
MAX_COLORS = len(DEFAULT_SYMBOLS)

_HEX_DIGITS = set("0123456789abcdefABCDEF")

COLOR_DISTANCE_METHODS = ("euclidean", "redmean")


class InvalidColorError(ValueError):
    """Raised when a colour string cannot be parsed."""


def clamp(value: float, low: float = 0, high: float = 255) -> int:
    """Clamp ``value`` into the inclusive ``[low, high]`` range."""

    return int(max(low, min(high, value)))


def normalize_hex(value: str) -> str:
    """Normalise ``"abc"`` / ``"#ABC"`` / ``"#aabbcc"`` into ``"#AABBCC"``.

    Raises:
        InvalidColorError: if the value is not a valid 3 or 6 digit hex colour.
    """

    if not isinstance(value, str):
        raise InvalidColorError("colour must be a string")

    candidate = value.strip().lstrip("#")
    if len(candidate) == 3:
        candidate = "".join(char * 2 for char in candidate)
    if len(candidate) != 6 or any(char not in _HEX_DIGITS for char in candidate):
        raise InvalidColorError(f"invalid hex colour: {value!r}")

    return "#" + candidate.upper()


def hex_to_rgb(value: str) -> RGB:
    """Convert a hex colour string into an ``(r, g, b)`` tuple."""

    candidate = normalize_hex(value).lstrip("#")
    return (int(candidate[0:2], 16), int(candidate[2:4], 16), int(candidate[4:6], 16))


def rgb_to_hex(rgb: Sequence[int]) -> str:
    """Convert an ``(r, g, b)`` sequence into a normalised hex string."""

    red, green, blue = (clamp(channel) for channel in tuple(rgb)[:3])
    return f"#{red:02X}{green:02X}{blue:02X}"


def color_distance(first: RGB, second: RGB, method: str = "redmean") -> float:
    """Return the perceptual-ish distance between two RGB colours.

    Two strategies are supported:

    * ``euclidean`` – plain RGB euclidean distance (fast, naive).
    * ``redmean``  – the "redmean" approximation which weights the red channel
      according to the shared red level and therefore tracks human perception
      far better across the whole cube.  This is the default.
    """

    if method not in COLOR_DISTANCE_METHODS:
        raise InvalidColorError(
            f"unknown color distance method: {method!r} "
            f"(expected one of {', '.join(COLOR_DISTANCE_METHODS)})"
        )

    red_1, green_1, blue_1 = first[:3]
    red_2, green_2, blue_2 = second[:3]

    if method == "euclidean":
        return math.sqrt(
            (red_1 - red_2) ** 2 + (green_1 - green_2) ** 2 + (blue_1 - blue_2) ** 2
        )

    red_mean = (red_1 + red_2) / 2.0
    delta_red = red_1 - red_2
    delta_green = green_1 - green_2
    delta_blue = blue_1 - blue_2
    # The reference C implementation uses integer shifts (``>> 8``); in Python
    # the equivalent division keeps the weights identical without truncating.
    return math.sqrt(
        (((512 + red_mean) * delta_red ** 2) / 256.0)
        + 4 * delta_green ** 2
        + (((767 - red_mean) * delta_blue ** 2) / 256.0)
    )


def nearest_color_index(
    target: RGB, palette: Sequence[RGB], method: str = "redmean"
) -> int:
    """Return the index of the palette entry closest to ``target``.

    Ties are resolved in favour of the lowest index which keeps the output
    deterministic for a given input.
    """

    if not palette:
        raise InvalidColorError("cannot match a colour against an empty palette")

    return min(
        range(len(palette)),
        key=lambda index: (color_distance(target, palette[index], method), index),
    )


def relative_luminance(rgb: RGB) -> float:
    """Return the WCAG relative luminance (0 = black, 1 = white)."""

    channels = []
    for channel in tuple(rgb)[:3]:
        value = clamp(channel) / 255.0
        channels.append(value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4)
    red, green, blue = channels
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def readable_text_color(background: str) -> str:
    """Pick black or white text depending on the background brightness."""

    return "#000000" if relative_luminance(hex_to_rgb(background)) > 0.45 else "#FFFFFF"


def parse_palette_string(raw: str, max_colors: int = MAX_COLORS) -> List[str]:
    """Parse a comma (or whitespace) separated list of hex colours."""

    if not isinstance(raw, str):
        raise InvalidColorError("palette must be a string")

    tokens = [token for token in raw.replace("\n", ",").replace(" ", ",").split(",") if token]
    if not tokens:
        raise InvalidColorError("palette must contain at least one colour")
    if len(tokens) > max_colors:
        raise InvalidColorError(f"palette is limited to {max_colors} colours")

    palette: List[str] = []
    for token in tokens:
        color = normalize_hex(token)
        if color not in palette:
            palette.append(color)

    if not palette:
        raise InvalidColorError("palette must contain at least one colour")
    return palette


def sort_hex_colors(colors: Sequence[str], mode: str = "luminance") -> List[str]:
    """Sort a palette either by brightness (default) or by hue."""

    unique: List[str] = []
    for color in colors:
        normalized = normalize_hex(color)
        if normalized not in unique:
            unique.append(normalized)

    if mode == "hex":
        return sorted(unique)
    if mode == "luminance":
        return sorted(unique, key=lambda color: relative_luminance(hex_to_rgb(color)))
    raise InvalidColorError(f"unknown palette sort mode: {mode!r}")


def assign_symbols(colors: Sequence[str], symbols: str = DEFAULT_SYMBOLS) -> List[str]:
    """Map every colour of a palette to a unique chart symbol."""

    if not symbols:
        raise InvalidColorError("symbol set must not be empty")
    if len(colors) > len(symbols):
        raise InvalidColorError(
            f"cannot label {len(colors)} colours with {len(symbols)} symbols"
        )
    return [symbols[index] for index in range(len(colors))]


def numbered_labels(count: int) -> List[str]:
    """Return right aligned ``1..count`` labels for row/column headers."""

    return [str(number) for number in range(1, count + 1)]


def grid_to_hex(grid: Sequence[Sequence[int]], palette: Sequence[str]) -> List[List[str]]:
    """Expand an index matrix into a matrix of hex colour strings."""

    return [[palette[index] for index in row] for row in grid]


def symbol_grid(grid: Sequence[Sequence[int]], symbols: Sequence[str]) -> List[List[str]]:
    """Expand an index matrix into a matrix of chart symbols."""

    return [[symbols[index] for index in row] for row in grid]


def stitch_counts(grid: Sequence[Sequence[int]]) -> Dict[int, int]:
    """Count how many cells use each palette index."""

    counts: Dict[int, int] = {}
    for row in grid:
        for index in row:
            counts[index] = counts.get(index, 0) + 1
    return counts


# --------------------------------------------------------------------------- #
# Serialisation safety
# --------------------------------------------------------------------------- #

#: Characters a spreadsheet treats as the start of a formula.  A cell starting
#: with one of these is executed when the exported CSV is opened in Excel,
#: LibreOffice or Google Sheets (CSV injection / formula injection).
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: object) -> str:
    """Neutralise spreadsheet formula injection in an exported CSV cell.

    Quoting alone is not enough: ``csv.writer`` quotes the field but Excel
    still evaluates a leading ``=``.  Prefixing with a single quote keeps the
    text visible while forcing it to be treated as a literal.
    """

    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text


def markdown_safe(value: object) -> str:
    """Escape the Markdown control characters in a user supplied string."""

    text = "" if value is None else str(value)
    for character in ("\\", "`", "*", "_", "{", "}", "[", "]", "(", ")", "#", "+", "-", ".", "!", "|"):
        text = text.replace(character, "\\" + character)
    # Newlines would break the table/heading structure.
    return text.replace("\r", " ").replace("\n", " ")


def _legend_rows(
    palette: Sequence[str],
    labels: Sequence[str],
    symbols: Sequence[str],
    grid: Sequence[Sequence[int]],
    repeat_x: int,
    repeat_y: int,
) -> List[Dict[str, object]]:
    counts = stitch_counts(grid)
    total = max(1, len(grid) * max(1, len(grid[0]))) * repeat_x * repeat_y

    rows: List[Dict[str, object]] = []
    for index, color in enumerate(palette):
        count = counts.get(index, 0) * repeat_x * repeat_y
        rows.append(
            {
                "index": index,
                "hex": color,
                "label": labels[index] if index < len(labels) else f"Colour {index + 1}",
                "symbol": symbols[index],
                "count": count,
                "percent": round((count / total) * 100, 2),
            }
        )
    return rows


def grid_to_csv(
    grid: Sequence[Sequence[int]],
    palette: Sequence[str],
    labels: Sequence[str],
    symbols: Sequence[str],
    title: str = "Pixel pattern",
    repeat_x: int = 1,
    repeat_y: int = 1,
) -> str:
    """Render the pattern as CSV (legend + chart), ready to download."""

    width = len(grid[0]) if grid else 0
    height = len(grid)
    total = max(1, width * height) * repeat_x * repeat_y
    columns = numbered_labels(width)

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    # Every cell goes through ``csv_safe``: the title is user supplied and a
    # leading "=" would otherwise be evaluated by spreadsheet software.
    writer.writerow([csv_safe(title)])
    writer.writerow(["Stitch size", f"{width} x {height} stitches"])
    writer.writerow(["Repeats", f"{repeat_x} x {repeat_y}"])
    writer.writerow(["Total stitches", total])
    writer.writerow([])

    writer.writerow(["Symbol", "Colour", "Hex", "Stitches", "Percent"])
    for entry in _legend_rows(palette, labels, symbols, grid, repeat_x, repeat_y):
        writer.writerow(
            [
                entry["symbol"],
                csv_safe(entry["label"]),
                entry["hex"],
                entry["count"],
                f"{entry['percent']}%",
            ]
        )
    writer.writerow([])

    writer.writerow(["Chart"] + columns)
    for row_index, row in enumerate(grid, start=1):
        writer.writerow([row_index] + [symbols[index] for index in row])

    return buffer.getvalue()


def grid_to_markdown(
    grid: Sequence[Sequence[int]],
    palette: Sequence[str],
    labels: Sequence[str],
    symbols: Sequence[str],
    title: str = "Pixel pattern",
    repeat_x: int = 1,
    repeat_y: int = 1,
) -> str:
    """Render the pattern as a Markdown document (handy for sharing)."""

    width = len(grid[0]) if grid else 0
    height = len(grid)
    total = max(1, width * height) * repeat_x * repeat_y
    columns = numbered_labels(width)
    gutter = len(str(height))

    lines = [f"# {markdown_safe(title)}", ""]
    lines.append(f"- **Size:** {width} x {height} stitches")
    lines.append(f"- **Repeats:** {repeat_x} x {repeat_y}")
    lines.append(f"- **Total stitches:** {total}")
    lines.append("")
    lines.append("## Legend")
    lines.append("")
    lines.append("| Symbol | Colour | Hex | Stitches | Percent |")
    lines.append("| :----: | ------ | --- | -------: | ------: |")
    for entry in _legend_rows(palette, labels, symbols, grid, repeat_x, repeat_y):
        lines.append(
            f"| `{entry['symbol']}` | {markdown_safe(entry['label'])} | `{entry['hex']}` | "
            f"{entry['count']} | {entry['percent']}% |"
        )
    lines.append("")
    lines.append("## Chart")
    lines.append("")
    lines.append("|   | " + " | ".join(columns) + " |")
    lines.append("|---|" + "|".join(["---"] * width) + "|")
    for row_index, row in enumerate(grid, start=1):
        cells = " | ".join(symbols[index] for index in row)
        lines.append(f"| **{str(row_index).rjust(gutter)}** | {cells} |")

    return "\n".join(lines) + "\n"

