"""Unit tests for the Pillow pipeline in ``app.processor``."""

from __future__ import annotations

import base64
import io

import pytest
from PIL import Image

from app.processor import (
    BUILT_IN_PALETTES,
    DITHER_MODES,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE,
    PALETTE_SORTS,
    QUANTIZE_METHODS,
    RESIZE_MODES,
    PaletteColor,
    ProcessingError,
    TransformOptions,
    apply_bayer_dither,
    build_pattern,
    list_palettes,
    render_preview,
    transform_image,
    _resolve_palette,
)
from app.utils import relative_luminance, rgb_to_hex
from conftest import (
    checkerboard_image,
    encode,
    gradient_image,
    rgba_image,
    solid_image,
)

GRID = [[0, 1, 1], [0, 0, 1], [2, 2, 0]]
PALETTE = [
    PaletteColor(hex="#000000", count=4, label="Black"),
    PaletteColor(hex="#FFFFFF", count=3, label="White"),
    PaletteColor(hex="#FF0000", count=2, label="Red"),
]


class TestOptionsValidation:
    def test_defaults_are_valid(self) -> None:
        assert TransformOptions().validate().grid_width == 32

    def test_string_numbers_are_coerced(self) -> None:
        assert TransformOptions(grid_width="24").validate().grid_width == 24  # type: ignore[arg-type]

    @pytest.mark.parametrize(
        "overrides",
        [
            {"grid_width": MIN_GRID_SIZE - 1},
            {"grid_width": MAX_GRID_SIZE + 1},
            {"max_colors": 1},
            {"max_colors": 999},
            {"resize_mode": "magic"},
            {"dither": "magic"},
            {"quantize_method": "magic"},
            {"palette_sort": "magic"},
            {"palette": "nintendo64"},
            {"palette": "custom", "custom_palette": ""},
            {"custom_palette": "#GGG"},
            {"background": "not-a-color"},
            {"preview_scale": 0},
        ],
    )
    def test_invalid_options_are_rejected(self, overrides: dict) -> None:
        with pytest.raises(ProcessingError):
            TransformOptions(**overrides).validate()

    def test_valid_boundaries_are_accepted(self) -> None:
        options = TransformOptions(
            grid_width=MIN_GRID_SIZE, max_colors=2, preview_scale=1, dither="bayer"
        ).validate()
        assert options.grid_width == MIN_GRID_SIZE


class TestPalettes:
    def test_every_bundled_palette_is_exposed(self) -> None:
        assert {palette["id"] for palette in list_palettes()} == set(BUILT_IN_PALETTES)

    def test_palette_entries_have_hex_and_label(self) -> None:
        for palette in list_palettes():
            for color in palette["colors"]:  # type: ignore[union-attr]
                assert color["hex"].startswith("#")
                assert color["label"]

    def test_auto_palette_is_empty_by_design(self) -> None:
        assert BUILT_IN_PALETTES["auto"]["colors"] == []


class TestTransformImage:
    def test_grid_keeps_the_aspect_ratio(self, png_bytes: bytes) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=16))
        assert result.width == 16
        assert result.height == 8  # 64x32 source -> 2:1
        assert (result.original_width, result.original_height) == (64, 32)
        assert len(result.grid) == 8
        assert all(len(row) == 16 for row in result.grid)

    def test_palette_never_exceeds_max_colors(self) -> None:
        data = encode(gradient_image(128, 128))
        result = transform_image(data, TransformOptions(grid_width=64, max_colors=4))
        assert 1 < len(result.palette) <= 4

    def test_solid_image_collapses_to_a_single_colour(self) -> None:
        result = transform_image(encode(solid_image()), TransformOptions(grid_width=8))
        assert len(result.palette) == 1
        assert result.palette[0].hex == "#FF0000"
        assert len({cell for row in result.grid for cell in row}) == 1

    def test_two_tone_image_keeps_both_colours(self, png_bytes: bytes) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=16, max_colors=4))
        assert len(result.palette) == 2
        assert {cell for cell in result.grid[0][:8]}.isdisjoint({cell for cell in result.grid[0][8:]})

    def test_counts_add_up_to_the_grid_size(self) -> None:
        result = transform_image(encode(checkerboard_image()), TransformOptions(grid_width=16))
        assert sum(color.count for color in result.palette) == result.width * result.height

    def test_grid_indexes_always_point_at_the_palette(self) -> None:
        result = transform_image(
            encode(gradient_image(96, 96)), TransformOptions(grid_width=32, max_colors=8)
        )
        for row in result.grid:
            for cell in row:
                assert 0 <= cell < len(result.palette)

    def test_symbols_are_unique_and_match_the_palette(self) -> None:
        result = transform_image(encode(gradient_image()), TransformOptions(grid_width=16))
        assert len(result.symbols) == len(result.palette)
        assert len(set(result.symbols)) == len(result.palette)

    def test_processing_is_deterministic(self, png_bytes: bytes) -> None:
        first = transform_image(png_bytes, TransformOptions(grid_width=16))
        second = transform_image(png_bytes, TransformOptions(grid_width=16))
        assert first.grid == second.grid
        assert first.preview_png == second.preview_png

    def test_preview_is_a_valid_png_of_the_expected_size(self, png_bytes: bytes) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=16, preview_scale=8))
        assert result.preview_png.startswith("data:image/png;base64,")
        decoded = base64.b64decode(result.preview_png.split(",", 1)[1])
        image = Image.open(io.BytesIO(decoded))
        assert image.format == "PNG"
        assert image.size == (result.width * 8, result.height * 8)

    def test_settings_are_echoed_back(self, png_bytes: bytes) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=16, dither="bayer"))
        assert result.settings["grid_width"] == 16
        assert result.settings["dither"] == "bayer"
        assert result.processing_ms >= 0

    def test_to_dict_uses_camel_case_keys(self, png_bytes: bytes) -> None:
        payload = transform_image(png_bytes, TransformOptions(grid_width=8)).to_dict()
        assert {"width", "height", "originalWidth", "previewPng", "processingMs"} <= payload.keys()
        assert payload["palette"][0].keys() == {"hex", "count", "label"}

    @pytest.mark.parametrize("mode", list(RESIZE_MODES))
    def test_every_resize_mode_runs(self, png_bytes: bytes, mode: str) -> None:
        assert transform_image(png_bytes, TransformOptions(grid_width=12, resize_mode=mode)).width == 12

    @pytest.mark.parametrize("method", list(QUANTIZE_METHODS))
    def test_every_quantize_method_runs(self, png_bytes: bytes, method: str) -> None:
        result = transform_image(
            png_bytes, TransformOptions(grid_width=12, quantize_method=method, max_colors=4)
        )
        assert 0 < len(result.palette) <= 4

    @pytest.mark.parametrize("dither", list(DITHER_MODES))
    def test_every_dither_mode_runs(self, png_bytes: bytes, dither: str) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=24, dither=dither, max_colors=4))
        assert 0 < len(result.palette) <= 4

    @pytest.mark.parametrize("sort_mode", list(PALETTE_SORTS))
    def test_every_sort_mode_runs(self, png_bytes: bytes, sort_mode: str) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=16, palette_sort=sort_mode))
        if sort_mode == "hex":
            hexes = [color.hex for color in result.palette]
            assert hexes == sorted(hexes)

    def test_usage_sort_puts_the_dominant_colour_first(self, png_bytes: bytes) -> None:
        result = transform_image(png_bytes, TransformOptions(grid_width=16, palette_sort="usage"))
        counts = [color.count for color in result.palette]
        assert counts == sorted(counts, reverse=True)


    def test_built_in_palette_snaps_every_pixel_to_it(self, png_bytes: bytes) -> None:
        result = transform_image(
            png_bytes, TransformOptions(grid_width=16, palette="gameboy", max_colors=4)
        )
        allowed = {color[0] for color in BUILT_IN_PALETTES["gameboy"]["colors"]}
        assert {color.hex for color in result.palette} <= allowed
        assert result.palette[0].label != ""  # keeps the Game Boy colour names

    def test_reduced_preset_stays_close_to_the_requested_colour_count(self) -> None:
        result = transform_image(
            encode(gradient_image(128, 128)),
            TransformOptions(grid_width=48, palette="pico8", max_colors=6),
        )
        assert len(result.palette) > 1
        assert len(result.palette) <= 6

    def test_reduced_preset_keeps_light_and_dark_colours(self) -> None:
        # Regression: presets are ordered dark-first, so a naive "first N" slice
        # collapsed a 16-colour palette down to near-black swatches.
        colors, _ = _resolve_palette(TransformOptions(palette="pico8", max_colors=5).validate())
        assert colors is not None
        luminances = sorted(relative_luminance(color) for color in colors)
        assert luminances[-1] - luminances[0] > 0.4

    def test_reduction_keeps_the_original_order_and_labels(self) -> None:
        original = BUILT_IN_PALETTES["pico8"]["colors"]
        colors, labels = _resolve_palette(
            TransformOptions(palette="pico8", max_colors=6).validate()
        )
        assert colors is not None
        hexes = [rgb_to_hex(color) for color in colors]
        # Still a subsequence of the full preset, in the same relative order.
        assert hexes == [entry[0] for entry in original if entry[0] in hexes]
        assert labels == [entry[1] for entry in original if entry[0] in hexes]

    def test_full_preset_is_used_when_the_colour_count_allows_it(self) -> None:
        colors, labels = _resolve_palette(TransformOptions(palette="pico8").validate())
        assert colors is not None
        assert len(colors) == len(BUILT_IN_PALETTES["pico8"]["colors"])
        assert len(labels) == len(colors)

    def test_custom_palette_is_honoured(self, png_bytes: bytes) -> None:
        result = transform_image(
            png_bytes,
            TransformOptions(grid_width=16, palette="custom", custom_palette="#FF0000,#00FF00"),
        )
        assert {color.hex for color in result.palette} <= {"#FF0000", "#00FF00"}
        assert {color.label for color in result.palette} <= {"Custom 1", "Custom 2"}

    def test_transparency_is_flattened_to_white(self) -> None:
        result = transform_image(encode(rgba_image()), TransformOptions(grid_width=8))
        assert len(result.palette) == 2
        assert "#FFFFFF" in {color.hex for color in result.palette}

    def test_background_option_replaces_the_backdrop(self) -> None:
        result = transform_image(
            encode(rgba_image()), TransformOptions(grid_width=8, background="#0000FF")
        )
        assert "#0000FF" in {color.hex for color in result.palette}

    def test_jpeg_source_is_supported(self, jpeg_bytes: bytes) -> None:
        assert transform_image(jpeg_bytes, TransformOptions(grid_width=16)).width == 16

    def test_greyscale_image_stays_monochrome(self) -> None:
        result = transform_image(
            encode(gradient_image()),
            TransformOptions(grid_width=16, palette="grayscale", max_colors=5),
        )
        for color in result.palette:
            red, green, blue = color.hex[1:3], color.hex[3:5], color.hex[5:7]
            assert red == green == blue

    def test_extreme_aspect_ratios_do_not_produce_zero(self) -> None:
        wide = transform_image(encode(solid_image(400, 4)), TransformOptions(grid_width=16))
        assert wide.height >= 1 and wide.width == 16
        tall = transform_image(encode(solid_image(4, 400)), TransformOptions(grid_width=16))
        assert tall.width == 16 and tall.height >= 1

    def test_empty_upload_raises(self) -> None:
        with pytest.raises(ProcessingError, match="empty"):
            transform_image(b"")

    def test_non_image_upload_raises(self) -> None:
        with pytest.raises(ProcessingError, match="unsupported image format"):
            transform_image(b"this is definitely not a png")

    def test_oversized_upload_raises(self) -> None:
        from app.processor import MAX_IMAGE_BYTES

        with pytest.raises(ProcessingError, match="too large"):
            transform_image(b"0" * (MAX_IMAGE_BYTES + 1))


class TestDithering:
    def test_bayer_dither_perturbs_the_image(self) -> None:
        image = Image.new("RGB", (8, 8), (128, 128, 128))
        dithered = apply_bayer_dither(image.copy(), strength=64)
        assert list(dithered.getdata()) != list(image.getdata())
        assert any(pixel != (128, 128, 128) for pixel in dithered.getdata())

    def test_bayer_dither_keeps_channels_in_range(self) -> None:
        image = Image.new("RGB", (8, 8), (250, 5, 128))
        dithered = apply_bayer_dither(image, strength=255)
        for red, green, blue in dithered.getdata():
            assert 0 <= red <= 255 and 0 <= green <= 255 and 0 <= blue <= 255

    def test_dithering_changes_the_result_on_a_gradient(self) -> None:
        data = encode(gradient_image(64, 64))
        smooth = transform_image(data, TransformOptions(grid_width=32, max_colors=2, dither="none"))
        dithered = transform_image(
            data, TransformOptions(grid_width=32, max_colors=2, dither="floyd_steinberg")
        )
        assert dithered.grid != smooth.grid


class TestRenderPreview:
    def test_scale_is_respected(self) -> None:
        uri = render_preview(GRID, ["#000000", "#FFFFFF", "#FF0000"], scale=5, grid_lines=True)
        decoded = base64.b64decode(uri.split(",", 1)[1])
        assert Image.open(io.BytesIO(decoded)).size == (15, 15)

    def test_grid_lines_can_be_disabled(self) -> None:
        with_lines = render_preview(GRID, ["#000000", "#FFFFFF", "#FF0000"], 4, True)
        without = render_preview(GRID, ["#000000", "#FFFFFF", "#FF0000"], 4, False)
        assert with_lines != without

    def test_empty_grid_raises(self) -> None:
        with pytest.raises(ProcessingError, match="empty grid"):
            render_preview([], [], scale=4)




class TestBuildPattern:
    def test_symbol_chart_uses_the_generated_symbols(self) -> None:
        result = build_pattern(GRID, PALETTE, ["A", "B", "C"])
        assert result.grid == [["A", "B", "B"], ["A", "A", "B"], ["C", "C", "A"]]
        assert result.width == 3 and result.height == 3

    def test_labels_are_numbered_from_one(self) -> None:
        result = build_pattern(GRID, PALETTE)
        assert result.column_labels == ["1", "2", "3"]
        assert result.row_labels == ["1", "2", "3"]

    def test_symbols_are_generated_when_not_supplied(self) -> None:
        result = build_pattern(GRID, PALETTE)
        assert result.legend[0]["symbol"] == "A"
        assert result.grid[0][0] == "A"

    def test_repeats_multiply_the_stitch_count(self) -> None:
        single = build_pattern(GRID, PALETTE)
        repeated = build_pattern(GRID, PALETTE, repeat_x=3, repeat_y=2)
        assert single.total_stitches == 9
        assert repeated.total_stitches == 54
        assert repeated.legend[0]["count"] == single.legend[0]["count"] * 6

    def test_legend_percentages_add_up_to_one_hundred(self) -> None:
        result = build_pattern(GRID, PALETTE)
        assert sum(entry["percent"] for entry in result.legend) == pytest.approx(100.0, abs=0.05)

    def test_unused_palette_entries_stay_in_the_legend_with_zero_count(self) -> None:
        palette = PALETTE + [PaletteColor(hex="#123456", count=0, label="Unused")]
        result = build_pattern(GRID, palette, ["A", "B", "C", "D"])
        assert result.legend[-1]["count"] == 0

    def test_csv_and_markdown_are_rendered(self) -> None:
        result = build_pattern(GRID, PALETTE, title="Mushroom", repeat_x=2)
        assert result.csv.startswith("Mushroom")
        assert "Total stitches,18" in result.csv
        assert result.markdown.startswith("# Mushroom")
        assert "## Legend" in result.markdown and "## Chart" in result.markdown

    def test_empty_grid_raises(self) -> None:
        with pytest.raises(ProcessingError, match="empty"):
            build_pattern([], PALETTE)

    def test_ragged_rows_raise(self) -> None:
        with pytest.raises(ProcessingError, match="same length"):
            build_pattern([[0, 1], [0]], PALETTE)

    def test_out_of_range_index_raises(self) -> None:
        with pytest.raises(ProcessingError, match="does not exist"):
            build_pattern([[0, 99]], PALETTE)

    def test_too_few_symbols_raises(self) -> None:
        with pytest.raises(ProcessingError, match="not enough symbols"):
            build_pattern(GRID, PALETTE, ["A"])

    @pytest.mark.parametrize(("repeat_x", "repeat_y"), [(0, 1), (1, 21), (100, 1)])
    def test_invalid_repeats_raise(self, repeat_x: int, repeat_y: int) -> None:
        with pytest.raises(ProcessingError):
            build_pattern(GRID, PALETTE, repeat_x=repeat_x, repeat_y=repeat_y)

    def test_end_to_end_from_a_real_image(self, png_bytes: bytes) -> None:
        transform = transform_image(png_bytes, TransformOptions(grid_width=16, max_colors=6))
        pattern = build_pattern(transform.grid, transform.palette, transform.symbols)
        assert pattern.width == transform.width
        assert pattern.total_stitches == transform.width * transform.height
        assert len(pattern.legend) == len(transform.palette)

