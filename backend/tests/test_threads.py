"""Unit tests for the thread tables and the skein estimate (``app.threads``).

The matching and the arithmetic are pure and dependency free, which is the whole
reason this module exists separately from the Pillow pipeline.
"""

from __future__ import annotations

import pytest

from app.threads import (
    CROSS_STITCH_STRANDS,
    DMC,
    NO_THREAD,
    THREAD_BRANDS,
    THREAD_BRAND_IDS,
    THREAD_FABRIC_COUNT,
    ThreadBrand,
    ThreadColor,
    ThreadError,
    legend_threads,
    list_thread_brands,
    match_thread,
    skeins_required,
    stitches_per_skein,
    validate_thread_brand,
    working_length_mm,
)
from app.utils import color_distance, hex_to_rgb, normalize_hex


class TestThreadTable:
    def test_table_is_validated_at_import(self) -> None:
        # The brand object would not exist at all if a row were malformed: the
        # duplicate-code / bad-hex checks run in __post_init__.
        assert len(DMC.colors) > 100
        assert len({color.code for color in DMC.colors}) == len(DMC.colors)

    @pytest.mark.parametrize("color", DMC.colors, ids=lambda color: color.code)
    def test_every_colour_is_a_usable_hex(self, color: ThreadColor) -> None:
        assert normalize_hex(color.hex) == color.hex
        assert hex_to_rgb(color.hex)  # parses to a real RGB triple

    def test_duplicated_code_is_rejected(self) -> None:
        with pytest.raises(ThreadError, match="repeats code"):
            ThreadBrand(
                id="test",
                name="Test",
                description="",
                skein_length_m=8.0,
                skein_strands=6,
                colors=(ThreadColor("1", "A", "#000000"), ThreadColor("1", "B", "#FFFFFF")),
            )

    def test_invalid_hex_is_rejected(self) -> None:
        with pytest.raises(ThreadError, match="invalid hex"):
            ThreadBrand(
                id="test",
                name="Test",
                description="",
                skein_length_m=8.0,
                skein_strands=6,
                colors=(ThreadColor("1", "A", "not-a-colour"),),
            )

    def test_brand_needs_colours_and_a_skein(self) -> None:
        with pytest.raises(ThreadError, match="no colours"):
            ThreadBrand("test", "Test", "", 8.0, 6, ())
        with pytest.raises(ThreadError, match="impossible skein"):
            ThreadBrand("test", "Test", "", 8.0, 1, (ThreadColor("1", "A", "#000000"),))
        with pytest.raises(ThreadError, match="without a code or name"):
            ThreadBrand("test", "Test", "", 8.0, 6, (ThreadColor("", "A", "#000000"),))

    def test_palette_entries_carry_the_code_in_the_label(self) -> None:
        entries = DMC.palette_entries()
        assert len(entries) == len(DMC.colors)
        assert entries[0][1].split(" ", 1)[1]  # "<code> <name>"

    def test_brand_ids_start_with_none(self) -> None:
        assert THREAD_BRAND_IDS[0] == NO_THREAD
        assert set(THREAD_BRAND_IDS[1:]) == set(THREAD_BRANDS)

    def test_summaries_omit_the_colour_table(self) -> None:
        summary = next(item for item in list_thread_brands() if item["id"] == "dmc")
        assert summary["name"] == "DMC"
        assert summary["colors"] == len(DMC.colors)
        assert "rows" not in summary


class TestValidateThreadBrand:
    @pytest.mark.parametrize("value", [None, "", "   ", "none", "NONE"])
    def test_absent_means_no_brand(self, value: object) -> None:
        assert validate_thread_brand(value) == NO_THREAD  # type: ignore[arg-type]

    def test_known_brand_is_normalised(self) -> None:
        assert validate_thread_brand(" DMC ") == "dmc"

    def test_unknown_brand_raises(self) -> None:
        with pytest.raises(ThreadError, match="unknown thread brand"):
            validate_thread_brand("anchor")


class TestMatchThread:
    def test_exact_table_entries_match_themselves(self) -> None:
        for color in DMC.colors[::17]:  # a sample, not the whole table
            match = match_thread(color.hex, "dmc")
            assert match is not None
            assert match.code == color.code
            assert match.hex == color.hex

    def test_the_match_is_the_closest_entry_by_the_same_distance(self) -> None:
        # A near-miss on a known shade must land on that shade, not on a merely
        # popular one - this is the "did you buy the right thread?" test.
        target = "#B71F33"  # DMC 304 Red Medium
        match = match_thread(target, "dmc")
        assert match is not None and match.code == "304"

        matched = color_distance(hex_to_rgb(target), hex_to_rgb(match.hex))
        assert all(
            matched <= color_distance(hex_to_rgb(target), hex_to_rgb(color.hex))
            for color in DMC.colors
        )

    def test_matching_is_deterministic_and_cached(self) -> None:
        # The same object back: the lru_cache did its job.
        assert match_thread("#123456", "dmc") is match_thread("#123456", "dmc")

    def test_short_and_lowercase_hexes_match_the_same_thread(self) -> None:
        assert match_thread("b71f33", "dmc") == match_thread("#B71F33", "dmc")

    def test_no_brand_matches_nothing(self) -> None:
        assert match_thread("#000000", NO_THREAD) is None

    def test_an_unknown_colour_still_gets_the_closest_thread(self) -> None:
        # Nearest-neighbour never fails: it always returns *something*.
        assert match_thread("#7F3FBF", "dmc").code  # type: ignore[union-attr]


class TestSkeins:
    def test_working_length_uses_both_strands_of_the_skein(self) -> None:
        # 8 m x 6 strands / 2 worked strands, not the 8 m on the wrapper.
        assert working_length_mm("dmc") == pytest.approx(8000 * 6 / CROSS_STITCH_STRANDS)

    def test_fourteen_count_estimate_matches_the_documented_figure(self) -> None:
        # ~4,700 stitches before the waste allowance, ~4,250 after it.
        assert 4200 < stitches_per_skein("dmc", 14) < 4300

    def test_yield_scales_with_the_fabric_count(self) -> None:
        assert stitches_per_skein("dmc", 28) == pytest.approx(
            stitches_per_skein("dmc", 14) * 2, rel=0.01
        )

    def test_a_nonsense_fabric_count_raises(self) -> None:
        with pytest.raises(ThreadError, match="positive"):
            stitches_per_skein("dmc", 0)

    def test_default_fabric_count_is_the_documented_one(self) -> None:
        assert stitches_per_skein("dmc") == stitches_per_skein("dmc", THREAD_FABRIC_COUNT)

    @pytest.mark.parametrize(
        ("stitches", "expected"),
        [(0, 0), (1, 1), (4251, 1), (4252, 1), (4253, 2), (8504, 2), (8505, 3)],
    )
    def test_skeins_round_up_to_whole_skeins(self, stitches: int, expected: int) -> None:
        assert skeins_required(stitches, 4252) == expected

    def test_a_negative_count_is_treated_as_unused(self) -> None:
        assert skeins_required(-5, 4252) == 0

    def test_a_skein_that_covers_nothing_raises(self) -> None:
        with pytest.raises(ThreadError, match="zero stitches"):
            skeins_required(10, 0)


class TestLegendThreads:
    def test_no_brand_gives_no_rows(self) -> None:
        assert legend_threads(["#000000", "#FFFFFF"], [10, 20], NO_THREAD) == [None, None]

    def test_one_row_per_palette_colour(self) -> None:
        rows = legend_threads(["#000000", "#FFFFFF"], [10, 20], "dmc")
        assert [row["code"] for row in rows] == ["310", "B5200"]  # type: ignore[index]
        assert all(row["brand"] == "DMC" for row in rows)  # type: ignore[index]
        assert all(row["skeins"] == 1 for row in rows)  # type: ignore[index]

    def test_counts_shorter_than_the_palette_default_to_zero(self) -> None:
        # The editor appends a background colour that may end up unused.
        rows = legend_threads(["#000000", "#FFFFFF"], [0], "dmc")
        assert rows[1]["skeins"] == 0  # type: ignore[index]

    def test_unknown_brand_raises(self) -> None:
        with pytest.raises(ThreadError):
            legend_threads(["#000000"], [1], "not-a-brand")