"""Unit tests for the pure helpers in ``app.utils``."""

from __future__ import annotations

import pytest

from app.utils import (
    DEFAULT_SYMBOLS,
    InvalidColorError,
    assign_symbols,
    color_distance,
    grid_to_csv,
    grid_to_hex,
    grid_to_markdown,
    hex_to_rgb,
    nearest_color_index,
    normalize_hex,
    numbered_labels,
    parse_palette_string,
    readable_text_color,
    relative_luminance,
    rgb_to_hex,
    sort_hex_colors,
    stitch_counts,
    symbol_grid,
)

GRID = [[0, 1, 1], [0, 0, 1], [2, 2, 0]]
PALETTE = ["#000000", "#FFFFFF", "#FF0000"]
LABELS = ["Black", "White", "Red"]
SYMBOLS = ["A", "B", "C"]


class TestHexConversion:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("abc", "#AABBCC"),
            ("#abc", "#AABBCC"),
            ("#AABBCC", "#AABBCC"),
            ("aabbcc", "#AABBCC"),
            ("  #123456 ", "#123456"),
        ],
    )
    def test_normalize_hex_accepts_short_and_long_forms(self, raw: str, expected: str) -> None:
        assert normalize_hex(raw) == expected

    @pytest.mark.parametrize("raw", ["", "#12", "zzzzzz", "#12345", None, 123])
    def test_normalize_hex_rejects_garbage(self, raw: object) -> None:
        with pytest.raises(InvalidColorError):
            normalize_hex(raw)  # type: ignore[arg-type]

    def test_round_trip(self) -> None:
        assert rgb_to_hex(hex_to_rgb("#3A7BD5")) == "#3A7BD5"

    def test_rgb_to_hex_clamps_out_of_range_channels(self) -> None:
        assert rgb_to_hex((-20, 300, 12)) == "#00FF0C"


class TestColorDistance:
    def test_identical_colors_have_zero_distance(self) -> None:
        assert color_distance((10, 20, 30), (10, 20, 30)) == pytest.approx(0.0)

    def test_both_methods_rank_a_proximity_match_first(self) -> None:
        palette = [(0, 0, 0), (250, 250, 250), (255, 0, 0)]
        for method in ("euclidean", "redmean"):
            assert nearest_color_index((240, 10, 10), palette, method) == 2

    def test_redmean_tracks_perception_better_than_euclidean(self) -> None:
        # Two dark blues are perceptually closer to each other than to black.
        navy, dark, black = (0, 0, 80), (0, 0, 40), (0, 0, 0)
        assert color_distance(navy, dark, "redmean") < color_distance(navy, black, "redmean")

    def test_unknown_method_raises(self) -> None:
        with pytest.raises(InvalidColorError):
            color_distance((0, 0, 0), (1, 1, 1), "lab")

    def test_nearest_color_requires_a_palette(self) -> None:
        with pytest.raises(InvalidColorError):
            nearest_color_index((0, 0, 0), [])


class TestLuminance:
    def test_black_and_white_bounds(self) -> None:
        assert relative_luminance((0, 0, 0)) == pytest.approx(0.0)
        assert relative_luminance((255, 255, 255)) == pytest.approx(1.0)

    @pytest.mark.parametrize(
        ("background", "expected"),
        [("#000000", "#FFFFFF"), ("#FFFFFF", "#000000"), ("#FFD700", "#000000")],
    )
    def test_readable_text_color(self, background: str, expected: str) -> None:
        assert readable_text_color(background) == expected


class TestPaletteHelpers:
    def test_parse_palette_string_deduplicates_and_normalizes(self) -> None:
        assert parse_palette_string("#fff, 000000,#FFF") == ["#FFFFFF", "#000000"]

    def test_parse_palette_string_rejects_empty(self) -> None:
        with pytest.raises(InvalidColorError):
            parse_palette_string("  ,  ")

    def test_parse_palette_string_enforces_the_colour_limit(self) -> None:
        too_many = ",".join(["#000000"] * 10)
        with pytest.raises(InvalidColorError):
            parse_palette_string(too_many, max_colors=4)

    def test_sort_by_luminance_is_dark_to_light(self) -> None:
        assert sort_hex_colors(["#FFFFFF", "#000000", "#808080"], "luminance") == [
            "#000000",
            "#808080",
            "#FFFFFF",
        ]

    def test_sort_by_hex_is_alphabetical(self) -> None:
        assert sort_hex_colors(["#FFFFFF", "#000000"], "hex") == ["#000000", "#FFFFFF"]

    def test_sort_rejects_unknown_mode(self) -> None:
        with pytest.raises(InvalidColorError):
            sort_hex_colors(["#000000"], "by-vibes")

    def test_assign_symbols_is_stable_and_unique(self) -> None:
        assert assign_symbols(PALETTE) == list(DEFAULT_SYMBOLS[:3])
        assert len(set(assign_symbols(list(DEFAULT_SYMBOLS)))) == len(DEFAULT_SYMBOLS)

    def test_assign_symbols_rejects_overflow(self) -> None:
        with pytest.raises(InvalidColorError):
            assign_symbols(["#000000", "#FFFFFF"], symbols="A")


class TestGridHelpers:
    def test_numbered_labels(self) -> None:
        assert numbered_labels(3) == ["1", "2", "3"]
        assert numbered_labels(0) == []

    def test_grid_to_hex_and_symbol_grid(self) -> None:
        assert grid_to_hex(GRID, PALETTE)[0] == ["#000000", "#FFFFFF", "#FFFFFF"]
        assert symbol_grid(GRID, SYMBOLS)[2] == ["C", "C", "A"]

    def test_stitch_counts(self) -> None:
        assert stitch_counts(GRID) == {0: 4, 1: 3, 2: 2}

    def test_csv_contains_metadata_legend_and_chart(self) -> None:
        csv_text = grid_to_csv(GRID, PALETTE, LABELS, SYMBOLS, title="Heart", repeat_x=2, repeat_y=1)
        assert csv_text.startswith("Heart\n")
        assert "Stitch size,3 x 3 stitches" in csv_text
        assert "Total stitches,18" in csv_text
        assert "Symbol,Colour,Hex,Stitches,Percent" in csv_text
        assert "Chart,1,2,3" in csv_text
        assert "1,A,B,B" in csv_text

    def test_markdown_has_tables_and_headers(self) -> None:
        markdown = grid_to_markdown(GRID, PALETTE, LABELS, SYMBOLS, title="Heart")
        assert "# Heart" in markdown
        assert "**Size:** 3 x 3 stitches" in markdown
        assert "| `A` | Black | `#000000` | 4 | 44.44% |" in markdown
        assert "**1**" in markdown

    def test_markdown_percentages_cover_the_whole_chart(self) -> None:
        markdown = grid_to_markdown(GRID, PALETTE, LABELS, SYMBOLS)
        percentages = [
            float(line.split("|")[-2].strip().rstrip("%"))
            for line in markdown.splitlines()
            if line.startswith("| `")
        ]
        assert sum(percentages) == pytest.approx(100.0, abs=0.05)


class TestThreadColumns:
    """The thread block is opt-in: without it the exports must not change."""

    THREADS = {
        "brand": "DMC",
        "fabricCount": 14,
        "stitchesPerSkein": 4251,
        "rows": [
            {"brand": "DMC", "code": "310", "name": "Black", "hex": "#000000", "skeins": 2},
            {"brand": "DMC", "code": "B5200", "name": "Snow White", "hex": "#FFFFFF", "skeins": 1},
            {"brand": "DMC", "code": "321", "name": "Red", "hex": "#C72B3B", "skeins": 1},
        ],
    }

    def test_csv_gains_the_thread_columns(self) -> None:
        csv_text = grid_to_csv(GRID, PALETTE, LABELS, SYMBOLS, threads=self.THREADS)
        assert "Thread brand,DMC" in csv_text
        assert "14 ct fabric, 4251 stitches per skein" in csv_text
        assert "Symbol,Colour,Hex,Stitches,Percent,Thread,Thread name,Skeins" in csv_text
        assert "A,Black,#000000,4,44.44%,DMC 310,Black,2" in csv_text

    def test_markdown_gains_the_thread_columns(self) -> None:
        markdown = grid_to_markdown(GRID, PALETTE, LABELS, SYMBOLS, threads=self.THREADS)
        assert "- **Thread brand:** DMC" in markdown
        assert "- **Skein estimate:** 14 ct fabric, 4251 stitches per skein" in markdown
        assert "| Symbol | Colour | Hex | Stitches | Percent | Thread | Thread name | Skeins |" in markdown
        assert "| `A` | Black | `#000000` | 4 | 44.44% | DMC 310 | Black | 2 |" in markdown

    def test_omitting_the_block_keeps_the_old_output(self) -> None:
        assert "Thread" not in grid_to_csv(GRID, PALETTE, LABELS, SYMBOLS)
        assert "Thread" not in grid_to_markdown(GRID, PALETTE, LABELS, SYMBOLS)

    def test_repeats_are_counted_towards_the_skeins(self) -> None:
        threads = {**self.THREADS, "rows": [{**row, "skeins": 0} for row in self.THREADS["rows"]]}
        csv_text = grid_to_csv(GRID, PALETTE, LABELS, SYMBOLS, repeat_x=2, repeat_y=1, threads=threads)
        # 4 cells x 2 repeats = 8 stitches out of 18, and the caller's skein
        # counts are passed straight through - they are already multiplied.
        assert "A,Black,#000000,8,44.44%,DMC 310,Black,0" in csv_text

