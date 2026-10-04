"""Thread-brand colour tables and the skein estimate behind the craft legend.

A pattern is only useful to somebody holding a needle if it tells them *which
thread* to buy.  This module holds the colour tables (``DMC`` today), matches a
generated palette onto one with the same redmean distance the pixel pipeline
already uses, and turns a stitch count into a number of skeins.

Like ``utils``, this module imports nothing outside the standard library, so the
table and the arithmetic can be unit tested without Pillow or FastAPI.

The matching is deliberately the *same* ``nearest_color_index`` the quantiser
uses: one distance function for the whole app means a swatch that looks closest
on screen and the thread that gets recommended agree, and ties keep resolving to
the same (lowest) index.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional, Sequence, Tuple

from .utils import RGB, InvalidColorError, hex_to_rgb, nearest_color_index, normalize_hex

__all__ = [
    "NO_THREAD",
    "THREAD_BRANDS",
    "THREAD_BRAND_IDS",
    "THREAD_FABRIC_COUNT",
    "DMC",
    "ThreadBrand",
    "ThreadColor",
    "ThreadError",
    "ThreadMatch",
    "legend_threads",
    "list_thread_brands",
    "match_thread",
    "skeins_required",
    "stitches_per_skein",
    "validate_thread_brand",
]

#: Brand id meaning "do not match anything" - the palette keeps its hex labels.
NO_THREAD = "none"

#: Strands worked per stitch.  A skein is sold as N strands twisted together and
#: cross stitch uses a couple of them, so one skein is worth several times its
#: nominal length *as working thread*.
CROSS_STITCH_STRANDS = 2

#: Fabric count the skein estimate assumes.
#:
#: Stitches per skein depend entirely on the fabric, so this is an assumption and
#: is reported back to the client (``fabricCount`` on ``/api/pattern``) rather than
#: hidden: 14-count is the most common Aida for charted patterns, and the number
#: is only meaningful next to the count it was computed for.
THREAD_FABRIC_COUNT = 14

#: Fraction of the thread lost to the ends of the ball, thread breaks and the
#: back of the work.  10% is the usual rule of thumb for embroidery floss.
THREAD_WASTE = 0.1


class ThreadError(ValueError):
    """Raised when a thread brand cannot be resolved."""


@dataclass(frozen=True)
class ThreadColor:
    """One entry of a brand's colour table."""

    code: str
    name: str
    hex: str


@dataclass(frozen=True)
class ThreadBrand:
    """A thread manufacturer: a colour table plus how one skein is wound."""

    id: str
    name: str
    description: str
    #: Metres of floss in a single skein (8 for a DMC 6-strand skein).
    skein_length_m: float
    #: Strands twisted together into that skein (6 for DMC embroidery floss).
    skein_strands: int
    colors: Tuple[ThreadColor, ...]

    def __post_init__(self) -> None:
        # Validated once, at import: a typo in a 130-row table is otherwise a
        # silently wrong colour recommendation, which is exactly the kind of
        # thing a stitcher discovers halfway through a project.
        if not self.colors:
            raise ThreadError(f"thread brand '{self.id}' has no colours")
        if self.skein_length_m <= 0 or self.skein_strands < CROSS_STITCH_STRANDS:
            raise ThreadError(f"thread brand '{self.id}' has an impossible skein")

        codes = set()
        for color in self.colors:
            if not color.code or not color.name:
                raise ThreadError(f"thread brand '{self.id}' has a colour without a code or name")
            if color.code in codes:
                raise ThreadError(f"thread brand '{self.id}' repeats code {color.code}")
            codes.add(color.code)
            try:
                normalize_hex(color.hex)
            except InvalidColorError as error:
                raise ThreadError(
                    f"thread {color.code} of brand '{self.id}' has an invalid hex: {color.hex!r}"
                ) from error

    def palette_entries(self) -> List[Tuple[str, str]]:
        """The brand as ``(hex, label)`` pairs for ``BUILT_IN_PALETTES``."""

        return [(color.hex, f"{color.code} {color.name}") for color in self.colors]


# --------------------------------------------------------------------------- #
# Colour tables
# --------------------------------------------------------------------------- #
#: A curated slice of the DMC embroidery floss range.
#:
#: Not all 450+ shades: the range is large, most of it duplicates a shade already
#: here, and every extra row is another hex that can be wrong.  What matters for
#: nearest-colour matching is that the gaps are filled - the entries below span
#: the whole hue and lightness space, so a matched code is close rather than
#: merely *a* code.  The hex values are the usual published screen approximations,
#: and a cross-stitch pattern should still be checked against a physical shade
#: card before buying a whole skein.
DMC = ThreadBrand(
    id="dmc",
    name="DMC",
    description="DMC stranded cotton embroidery floss (6-strand, 8 m skein).",
    skein_length_m=8.0,
    skein_strands=6,
    colors=(
        # --- whites, blacks and neutrals ------------------------------------
        ThreadColor("B5200", "Snow White", "#FFFFFF"),
        ThreadColor("3101", "White", "#FCFBF8"),
        ThreadColor("822", "Beige Gray Light", "#E7E2D3"),
        ThreadColor("945", "Tawny Beige", "#FBD5BB"),
        ThreadColor("951", "Tawny", "#FFE2AF"),
        ThreadColor("3770", "Tawny Very Light", "#FFEEE2"),
        ThreadColor("762", "Very Light Pearl Gray", "#ECECEC"),
        ThreadColor("415", "Pearl Gray", "#D3D3D6"),
        ThreadColor("318", "Steel Gray Light", "#ABABAB"),
        ThreadColor("414", "Steel Gray Dark", "#8C8C8C"),
        ThreadColor("648", "Light Beaver Gray", "#BCB4AC"),
        ThreadColor("317", "Pewter Gray", "#6C6C6C"),
        ThreadColor("646", "Steel Gray Dark", "#879196"),
        ThreadColor("413", "Dark Pewter Gray", "#565249"),
        ThreadColor("3799", "Very Dark Pewter Gray", "#424242"),
        ThreadColor("3370", "Ultra Very Dark Gray Brown", "#6B6259"),
        ThreadColor("3371", "Black Brown", "#1E1108"),
        ThreadColor("310", "Black", "#000000"),
        # --- reds -----------------------------------------------------------
        ThreadColor("666", "Bright Red", "#E31D42"),
        ThreadColor("321", "Red", "#C72B3B"),
        ThreadColor("304", "Red Medium", "#B71F33"),
        ThreadColor("498", "Red Dark", "#A7132B"),
        ThreadColor("816", "Garnet", "#970B23"),
        ThreadColor("815", "Garnet Medium", "#87071F"),
        ThreadColor("814", "Garnet Dark", "#7B001B"),
        ThreadColor("817", "Coral Red Very Dark", "#BB051F"),
        ThreadColor("347", "Very Dark Salmon", "#BF2D2D"),
        ThreadColor("3801", "Very Dark Melon", "#E74967"),
        ThreadColor("349", "Coral Dark", "#D21035"),
        ThreadColor("350", "Coral Medium", "#E04848"),
        ThreadColor("351", "Coral", "#E96A67"),
        ThreadColor("352", "Coral Light", "#FD9C97"),
        ThreadColor("353", "Peach", "#FED7CC"),
        ThreadColor("3705", "Melon", "#FF7992"),
        ThreadColor("3706", "Melon Light", "#FFBDC7"),
        # --- pinks and violets ---------------------------------------------
        ThreadColor("150", "Dusty Rose Ultra Very Dark", "#AB0249"),
        ThreadColor("151", "Dusty Rose Very Light", "#F0CED4"),
        ThreadColor("963", "Ultra Very Light Dusty Rose", "#FFD7D7"),
        ThreadColor("603", "Cranberry", "#FFA4BE"),
        ThreadColor("604", "Light Cranberry", "#FFB0BE"),
        ThreadColor("602", "Medium Cranberry", "#E24874"),
        ThreadColor("601", "Dark Cranberry", "#D1286A"),
        ThreadColor("915", "Dark Plum", "#820043"),
        ThreadColor("718", "Plum", "#9C2462"),
        ThreadColor("553", "Violet", "#90739C"),
        ThreadColor("554", "Violet Light", "#DBB3CB"),
        ThreadColor("209", "Dark Lavender", "#A37BA7"),
        ThreadColor("210", "Medium Lavender", "#C39FC3"),
        ThreadColor("211", "Light Lavender", "#E7CFE8"),
        # --- yellows and oranges --------------------------------------------
        ThreadColor("973", "Canary Bright", "#FFE300"),
        ThreadColor("307", "Lemon", "#FDED54"),
        ThreadColor("744", "Pale Yellow", "#FFE793"),
        ThreadColor("745", "Light Yellow Pale", "#FFE9AD"),
        ThreadColor("727", "Very Light Topaz", "#FFF1AF"),
        ThreadColor("726", "Light Topaz", "#FFD96B"),
        ThreadColor("725", "Topaz", "#FFC840"),
        ThreadColor("972", "Canary Deep", "#FFB515"),
        ThreadColor("971", "Pumpkin", "#F67F00"),
        ThreadColor("970", "Pumpkin Light", "#F78B13"),
        ThreadColor("608", "Bright Orange", "#FD5D35"),
        ThreadColor("946", "Burnt Orange", "#EB6307"),
        ThreadColor("900", "Dark Burnt Orange", "#D15807"),
        # --- greens ---------------------------------------------------------
        ThreadColor("699", "Green", "#056517"),
        ThreadColor("702", "Kelly Green", "#47A72F"),
        ThreadColor("703", "Chartreuse", "#7BB547"),
        ThreadColor("704", "Bright Chartreuse", "#9ECF34"),
        ThreadColor("987", "Dark Forest Green", "#587141"),
        ThreadColor("988", "Forest Green", "#6B8352"),
        ThreadColor("989", "Forest Green Medium", "#8DA675"),
        ThreadColor("895", "Very Dark Hunter Green", "#1B5300"),
        ThreadColor("890", "Ultra Dark Pistachio Green", "#174923"),
        ThreadColor("909", "Emerald Green Very Dark", "#156F49"),
        ThreadColor("910", "Dark Emerald Green", "#187E56"),
        ThreadColor("911", "Medium Emerald Green", "#189065"),
        ThreadColor("943", "Green Bright Medium", "#189D7E"),
        ThreadColor("991", "Aquamarine", "#477B6E"),
        ThreadColor("992", "Aquamarine Light", "#6FAE9F"),
        ThreadColor("993", "Aquamarine Very Light", "#90C0B4"),
        ThreadColor("959", "Sea Green Medium", "#59C7C2"),
        ThreadColor("502", "Blue Green", "#5B9071"),
        ThreadColor("501", "Dark Blue Green", "#396F52"),
        ThreadColor("500", "Very Dark Blue Green", "#044D33"),
        # --- blues ----------------------------------------------------------
        ThreadColor("797", "Royal Blue", "#13477D"),
        ThreadColor("796", "Royal Blue Dark", "#11416D"),
        ThreadColor("798", "Delec Dye Blue Dark", "#375A7F"),
        ThreadColor("7981", "Delec Dye Blue", "#466A8E"),
        ThreadColor("809", "Delec Dye Blue Pale", "#94A8C6"),
        ThreadColor("800", "Delft Blue Pale", "#C0CCDE"),
        ThreadColor("794", "Cornflower Blue Light", "#8B9CC1"),
        ThreadColor("793", "Cornflower Blue Medium", "#707DA2"),
        ThreadColor("792", "Cornflower Blue Dark", "#555B7B"),
        ThreadColor("791", "Cornflower Blue Very Dark", "#464563"),
        ThreadColor("322", "Baby Blue Dark", "#5A7EA6"),
        ThreadColor("519", "Sky Blue", "#7EB1C8"),
        ThreadColor("517", "Dark Wedgwood", "#3B768F"),
        ThreadColor("518", "Light Wedgwood", "#4F93A7"),
        ThreadColor("3765", "Peacock Blue", "#347F8C"),
        ThreadColor("597", "Turquoise", "#5BA3B3"),
        ThreadColor("598", "Turquoise Light", "#90C0CC"),
        ThreadColor("3750", "Antique Blue Very Dark", "#384253"),
        ThreadColor("3752", "Antique Blue Medium", "#7092B0"),
        # --- browns and earthy neutrals ------------------------------------
        ThreadColor("938", "Ultra Dark Coffee Brown", "#361F10"),
        ThreadColor("801", "Dark Coffee Brown", "#653919"),
        ThreadColor("898", "Very Dark Coffee Brown", "#492A13"),
        ThreadColor("433", "Medium Brown", "#7A4C29"),
        ThreadColor("434", "Light Brown", "#98603B"),
        ThreadColor("435", "Very Light Brown", "#B4713F"),
        ThreadColor("436", "Tan", "#CB9051"),
        ThreadColor("437", "Light Tan", "#E4B77A"),
        ThreadColor("738", "Very Light Tan", "#ECCC9C"),
        ThreadColor("739", "Ultra Very Light Tan", "#F8E4C8"),
        ThreadColor("3781", "Dark Mocha Brown", "#6B5743"),
        ThreadColor("3863", "Mocha Beige Medium", "#A4835C"),
        ThreadColor("3864", "Mocha Beige Light", "#CBB69C"),
        ThreadColor("934", "Avocado Green Black", "#313919"),
        ThreadColor("935", "Avocado Green Dark", "#424D21"),
        ThreadColor("936", "Avocado Green Very Dark", "#4C5826"),
        ThreadColor("937", "Avocado Green Medium", "#627133"),
        ThreadColor("3021", "Brown Green Gray Very Dark", "#4F4B41"),
        ThreadColor("3022", "Brown Green Gray Medium", "#8E9078"),
        ThreadColor("3023", "Brown Green Gray Light", "#B1AA97"),
    ),
)

#: Every bundled brand, keyed by the id sent on the wire.
THREAD_BRANDS: Dict[str, ThreadBrand] = {DMC.id: DMC}

#: Accepted ``threadBrand`` values, in the order the UI should offer them.
THREAD_BRAND_IDS: Tuple[str, ...] = (NO_THREAD,) + tuple(THREAD_BRANDS)


# --------------------------------------------------------------------------- #
# Brand lookup
# --------------------------------------------------------------------------- #


def validate_thread_brand(value: Optional[str]) -> str:
    """Return a known brand id, raising :class:`ThreadError` for anything else.

    A missing or empty value means "no brand" rather than an error: matching is
    opt-in, so every caller that does not care keeps today's behaviour.
    """

    candidate = (value or NO_THREAD).strip().lower() or NO_THREAD
    if candidate == NO_THREAD:
        return NO_THREAD
    if candidate not in THREAD_BRANDS:
        raise ThreadError(
            f"unknown thread brand '{value}' (expected {', '.join(THREAD_BRAND_IDS)})"
        )
    return candidate


def list_thread_brands() -> List[Dict[str, object]]:
    """Summarise the real brands for ``/api/options``.

    The colour tables themselves are far too big for an options response; the UI
    only needs the id, a label and enough detail for a helper line.
    """

    return [
        {
            "id": brand.id,
            "name": brand.name,
            "description": brand.description,
            "colors": len(brand.colors),
        }
        for brand in THREAD_BRANDS.values()
    ]


@lru_cache(maxsize=None)
def _brand_rgb(brand_id: str) -> Tuple[RGB, ...]:
    """The brand's colours as RGB triples, parsed once per process."""

    return tuple(hex_to_rgb(color.hex) for color in THREAD_BRANDS[brand_id].colors)


@dataclass(frozen=True)
class ThreadMatch:
    """The brand's thread closest to one palette colour."""

    brand: str
    code: str
    name: str
    hex: str


def match_thread(color: str, brand_id: str) -> Optional[ThreadMatch]:
    """Match one hex colour onto ``brand_id``'s table.

    Returns ``None`` for :data:`NO_THREAD`.  The result is cached per unique
    colour: a pattern has at most ``MAX_COLORS`` of them and the table is static
    for the life of the process.
    """

    brand_id = validate_thread_brand(brand_id)
    if brand_id == NO_THREAD:
        return None
    return _match_normalized(normalize_hex(color), brand_id)


@lru_cache(maxsize=None)
def _match_normalized(color: str, brand_id: str) -> ThreadMatch:
    brand = THREAD_BRANDS[brand_id]
    index = nearest_color_index(hex_to_rgb(color), _brand_rgb(brand_id))
    matched = brand.colors[index]
    return ThreadMatch(brand=brand.name, code=matched.code, name=matched.name, hex=matched.hex)


# --------------------------------------------------------------------------- #
# Skeins
# --------------------------------------------------------------------------- #


def working_length_mm(brand_id: str) -> float:
    """Millimetres of working thread in one skein.

    A skein is 8 m of *six-strand* floss.  Cross stitch works two of those
    strands at a time, so the whole skein is worth 8 m x 6 / 2 = 24 m of
    two-strand thread - not the 8 m printed on the wrapper.
    """

    brand = THREAD_BRANDS[validate_thread_brand(brand_id)]
    return brand.skein_length_m * 1000.0 * brand.skein_strands / CROSS_STITCH_STRANDS


def stitches_per_skein(brand_id: str, fabric_count: int = THREAD_FABRIC_COUNT) -> int:
    """Stitches one skein covers on ``fabric_count``-count fabric.

    A full cross stitch travels the cell diagonal twice (out and back) and a
    cell of ``count``-count fabric is 25.4 / count mm on a side::

        diagonal  = (25.4 / count) * sqrt(2)
        per stitch = 2 * diagonal            # front and back
        yield      = usable length / per stitch / (1 + waste)

    On 14-count DMC that is ~4,700 stitches before waste, ~4,250 after.
    """

    if fabric_count <= 0:
        raise ThreadError("fabric count must be a positive number of stitches per inch")

    diagonal_mm = (25.4 / fabric_count) * math.sqrt(2)
    usable = working_length_mm(brand_id)
    return int(usable / (2 * diagonal_mm) / (1 + THREAD_WASTE))


def skeins_required(stitches: int, yield_per_skein: int) -> int:
    """Whole skeins to buy for ``stitches`` stitches - zero for an unused colour.

    A colour painted away completely stays in the legend (see the editor notes),
    and telling somebody to buy a skein for zero stitches would be wrong.
    """

    if stitches <= 0:
        return 0
    if yield_per_skein <= 0:
        raise ThreadError("a skein cannot cover zero stitches")
    return math.ceil(stitches / yield_per_skein)


def legend_threads(
    colors: Sequence[str],
    stitches: Sequence[int],
    brand_id: str,
    fabric_count: int = THREAD_FABRIC_COUNT,
) -> List[Optional[Dict[str, object]]]:
    """Build one thread record per palette colour, for the legend and exports.

    ``None`` entries mean "no brand selected", which keeps the plain palette
    behaviour - and the plain export columns - completely untouched.
    """

    resolved = validate_thread_brand(brand_id)
    if resolved == NO_THREAD:
        return [None] * len(colors)

    yield_per_skein = stitches_per_skein(resolved, fabric_count)

    rows: List[Optional[Dict[str, object]]] = []
    for index, color in enumerate(colors):
        match = match_thread(color, resolved)
        used = stitches[index] if index < len(stitches) else 0
        rows.append(
            {
                "brand": match.brand,  # type: ignore[union-attr]
                "code": match.code,  # type: ignore[union-attr]
                "name": match.name,  # type: ignore[union-attr]
                "hex": match.hex,  # type: ignore[union-attr]
                "skeins": skeins_required(used, yield_per_skein),
            }
        )

    return rows