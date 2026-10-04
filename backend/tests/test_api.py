"""Integration tests for the HTTP layer (``app.main``)."""

from __future__ import annotations

import io
import json
import math

import pytest
from fastapi.testclient import TestClient

from app import main as main_module
from app.main import app
from app.processor import ALLOWED_FORMATS
from conftest import encode, gradient_image, solid_image

client = TestClient(app)

PNG_BYTES = encode(solid_image(64, 32, (200, 40, 40)))


def upload(data: bytes = PNG_BYTES, filename: str = "sample.png", **form: object) -> dict:
    """POST ``/api/transform`` with a file plus optional form fields."""

    payload = {key: str(value) for key, value in form.items()}
    response = client.post(
        "/api/transform", files={"file": (filename, io.BytesIO(data), "image/png")}, data=payload
    )
    assert response.status_code == 200, response.text
    return response.json()


class TestMetaRoutes:
    def test_root_banner(self) -> None:
        response = client.get("/")
        assert response.status_code == 200
        assert "Pixel Art & Pattern Generator" in response.json()["service"]

    def test_health(self) -> None:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_options_exposes_the_ui_contract(self) -> None:
        body = client.get("/api/options").json()
        assert "pixelate" in body["resizeModes"]
        assert "floyd_steinberg" in body["ditherModes"]
        assert body["limits"]["maxColors"] >= 2
        assert body["defaults"]["grid_width"] == 32
        assert len(body["symbols"]) >= body["limits"]["maxColors"]

    def test_palettes(self) -> None:
        body = client.get("/api/palettes").json()
        ids = {palette["id"] for palette in body["palettes"]}
        assert {"auto", "gameboy", "pico8"} <= ids
        gameboy = next(p for p in body["palettes"] if p["id"] == "gameboy")
        assert len(gameboy["colors"]) == 4
        assert gameboy["colors"][0]["label"] == "Darkest Green"

    def test_cors_defaults_to_localhost_not_wildcard(self) -> None:
        # A "*" default lets any website drive the API from a visitor's browser.
        preflight = client.options(
            "/api/transform",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://localhost:3000"

    def test_cors_refuses_an_unknown_origin(self) -> None:
        response = client.get(
            "/api/health", headers={"Origin": "https://evil.example.com"}
        )
        assert "access-control-allow-origin" not in response.headers

    def test_security_headers_are_present(self) -> None:
        response = client.get("/api/health")
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"

    def test_docs_are_enabled_by_default_for_local_development(self) -> None:
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").status_code == 200

    def test_openapi_schema_is_generated(self) -> None:
        assert "/api/transform" in client.get("/openapi.json").json()["paths"]


class TestSecurityHardening:
    """Regressions for the OWASP hardening (A02, A03, A05, A06, A09)."""

    def test_psd_is_not_on_the_format_allowlist(self) -> None:
        # CVE-2026-25990 is an out-of-bounds write in Pillow's PSD decoder.
        assert "PSD" not in ALLOWED_FORMATS

    @pytest.mark.parametrize("fmt", ["PPM", "ICO", "TGA"])
    def test_readable_but_non_allowlisted_formats_are_rejected(self, fmt: str) -> None:
        # Pillow decodes far more than we accept.  These are readable yet not
        # allowlisted, so they exercise the pre-decode rejection path.
        buffer = io.BytesIO()
        solid_image(16, 16).save(buffer, format=fmt)

        response = client.post(
            "/api/transform",
            files={"file": (f"image.{fmt.lower()}", io.BytesIO(buffer.getvalue()), "application/octet-stream")},
        )
        assert response.status_code == 400, response.text
        detail = response.json()["detail"]
        # Rejected on purpose - must not be reported as a decode failure.
        assert detail.startswith("unsupported image format")
        assert "could not decode" not in detail
        assert "BMP" in detail  # the full allowlist is advertised

    @pytest.mark.parametrize("fmt", ["PNG", "JPEG", "GIF", "BMP", "TIFF"])
    def test_allowed_formats_are_still_accepted(self, fmt: str) -> None:
        buffer = io.BytesIO()
        solid_image(32, 32).save(buffer, format=fmt)
        response = client.post(
            "/api/transform",
            files={"file": (f"image.{fmt.lower()}", io.BytesIO(buffer.getvalue()), "application/octet-stream")},
        )
        assert response.status_code == 200, response.text

    def test_rate_limit_returns_429_with_retry_after(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(main_module, "RATE_LIMIT_REQUESTS", 3)
        main_module._rate_buckets.clear()

        headers = {"x-forwarded-for": "203.0.113.9"}
        statuses = [
            client.post(
                "/api/transform",
                files={"file": ("s.png", io.BytesIO(PNG_BYTES), "image/png")},
                headers=headers,
            ).status_code
            for _ in range(4)
        ]
        assert statuses[:3] == [200, 200, 200]
        assert statuses[3] == 429

        limited = client.post(
            "/api/transform",
            files={"file": ("s.png", io.BytesIO(PNG_BYTES), "image/png")},
            headers=headers,
        )
        assert limited.status_code == 429
        assert int(limited.headers["retry-after"]) > 0

        # A different client has its own bucket.
        assert (
            client.post(
                "/api/transform",
                files={"file": ("s.png", io.BytesIO(PNG_BYTES), "image/png")},
                headers={"x-forwarded-for": "203.0.113.10"},
            ).status_code
            == 200
        )
        main_module._rate_buckets.clear()

    def test_cheap_endpoints_are_not_rate_limited(self) -> None:
        assert [client.get("/api/health").status_code for _ in range(30)] == [200] * 30

    def test_csv_export_neutralises_formula_injection(self) -> None:
        payload = {
            "title": '=cmd|\'/c calc\'!A1',
            "grid": [[0]],
            "palette": [{"hex": "#000000", "label": '=HYPERLINK("http://evil","x")'}],
        }
        response = client.post("/api/pattern", json=payload)
        assert response.status_code == 200, response.text
        body = response.json()
        # Neutralised by prefixing with a single quote, not merely quoted.
        assert not body["csv"].splitlines()[0].lstrip('"').startswith("=")
        assert body["csv"].count("'=") == 2

    def test_markdown_export_escapes_markup(self) -> None:
        response = client.post(
            "/api/pattern",
            json={
                "title": "# Injected heading",
                "grid": [[0]],
                "palette": [{"hex": "#000000", "label": "Normal"}],
            },
        )
        body = response.json()
        assert not body["markdown"].startswith("# #")
        assert "\\# Injected heading" in body["markdown"]

    def test_unhandled_errors_do_not_leak_internals(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def boom(*args: object, **kwargs: object) -> None:
            raise RuntimeError("secret internal path /etc/passwd")

        monkeypatch.setattr(main_module, "transform_image", boom)
        response = client.post(
            "/api/transform", files={"file": ("s.png", io.BytesIO(PNG_BYTES), "image/png")}
        )
        assert response.status_code == 500
        assert response.json() == {"detail": "internal server error"}
        assert "passwd" not in response.text


class TestTransformEndpoint:
    def test_defaults_are_applied_when_only_a_file_is_sent(self) -> None:
        body = upload()
        assert body["width"] == 32
        assert body["height"] == 16
        assert body["originalWidth"] == 64
        assert body["originalHeight"] == 32
        assert len(body["palette"]) == 1
        assert body["processingMs"] >= 0

    def test_preview_png_is_omitted_by_default(self) -> None:
        # The browser draws its own canvas, so the base64 PNG is pure overhead.
        assert "previewPng" not in upload(gridWidth=16)

    def test_preview_png_is_returned_when_requested(self) -> None:
        body = upload(gridWidth=16, preview="true", previewScale=4)
        assert body["previewPng"].startswith("data:image/png;base64,")

    def test_preview_flag_shrinks_the_payload(self) -> None:
        with_preview = json.dumps(upload(gridWidth=64, preview="true", previewScale=20))
        without_preview = json.dumps(upload(gridWidth=64, preview="false", previewScale=20))
        # The base64 PNG is pure overhead for the studio; without it the payload
        # is just the grid, palette and settings.
        assert without_preview < with_preview
        assert "previewPng" not in without_preview
        assert with_preview.count("data:image/png;base64") == 1

    def test_camel_case_form_fields_are_accepted(self) -> None:
        body = upload(gridWidth=16, maxColors=8, resizeMode="sample", paletteSort="hex")
        assert body["width"] == 16
        assert body["settings"]["resize_mode"] == "sample"

    def test_unknown_form_fields_fall_back_to_the_defaults(self) -> None:
        # Only camelCase aliases are read; anything else is ignored on purpose.
        body = upload(grid_width=24, max_colors=4, resize_mode="smooth")
        assert body["width"] == 32
        assert body["settings"]["resize_mode"] == "pixelate"

    def test_palette_preset_is_applied(self) -> None:
        body = upload(gridWidth=16, palette="gameboy", maxColors=4)
        allowed = {"#0F380F", "#306230", "#8BAC0F", "#9BBC0F"}
        assert {color["hex"] for color in body["palette"]} <= allowed

    def test_grid_indexes_match_the_palette_length(self) -> None:
        body = upload(gridWidth=32, maxColors=6)
        size = len(body["palette"])
        assert size >= 1
        assert all(0 <= cell < size for row in body["grid"] for cell in row)

    def test_grid_lines_flag_is_honoured(self) -> None:
        with_lines = upload(gridWidth=8, preview="true", previewScale=6, gridLines=True)
        without_lines = upload(gridWidth=8, preview="true", previewScale=6, gridLines=False)
        assert with_lines["previewPng"] != without_lines["previewPng"]

    def test_jpeg_upload_is_accepted(self) -> None:
        response = client.post(
            "/api/transform",
            files={"file": ("sample.jpg", io.BytesIO(encode(solid_image(), "JPEG")), "image/jpeg")},
        )
        assert response.status_code == 200

    @pytest.mark.parametrize(
        "form",
        [
            {"dither": "not-a-mode"},
            {"resizeMode": "not-a-mode"},
            {"quantizeMethod": "not-a-method"},
            {"palette": "not-a-palette"},
            {"background": "not-a-color"},
            {"palette": "custom", "customPalette": "#zzz"},
        ],
    )
    def test_unknown_option_values_return_400(self, form: dict) -> None:
        response = client.post(
            "/api/transform",
            files={"file": ("sample.png", io.BytesIO(PNG_BYTES), "image/png")},
            data=form,
        )
        assert response.status_code == 400
        assert response.json()["detail"]

    @pytest.mark.parametrize("form", [{"gridWidth": 1}, {"gridWidth": 5000}, {"maxColors": 0}])
    def test_out_of_range_numbers_return_422(self, form: dict) -> None:
        response = client.post(
            "/api/transform",
            files={"file": ("sample.png", io.BytesIO(PNG_BYTES), "image/png")},
            data=form,
        )
        assert response.status_code == 422

    def test_non_image_upload_returns_400(self) -> None:
        response = client.post(
            "/api/transform", files={"file": ("nope.txt", io.BytesIO(b"hello world"), "text/plain")}
        )
        assert response.status_code == 400
        assert "unsupported image format" in response.json()["detail"]

    def test_missing_file_returns_422(self) -> None:
        assert client.post("/api/transform", data={"gridWidth": 16}).status_code == 422

    def test_gradient_produces_more_than_one_colour(self) -> None:
        body = upload(encode(gradient_image(64, 64)), gridWidth=32, maxColors=8)
        assert 1 < len(body["palette"]) <= 8



class TestPatternEndpoint:
    PAYLOAD = {
        "title": "Mushroom",
        "grid": [[0, 1, 1], [0, 0, 1], [2, 2, 0]],
        "palette": [
            {"hex": "#000000", "count": 4, "label": "Black"},
            {"hex": "#FFFFFF", "count": 3, "label": "White"},
            {"hex": "#FF0000", "count": 2, "label": "Red"},
        ],
    }

    def post(self, **overrides: object) -> dict:
        payload = {**self.PAYLOAD, **overrides}
        response = client.post("/api/pattern", json=payload)
        assert response.status_code == 200, response.text
        return response.json()

    def test_chart_uses_symbols(self) -> None:
        body = self.post()
        assert body["grid"][0] == ["A", "B", "B"]
        assert body["width"] == 3 and body["height"] == 3
        assert body["totalStitches"] == 9

    def test_legend_carries_colour_names_and_counts(self) -> None:
        legend = self.post()["legend"]
        assert legend[0] == {
            "index": 0,
            "hex": "#000000",
            "label": "Black",
            "symbol": "A",
            "count": 4,
            "percent": 44.44,
            # Explicitly null rather than absent: the UI distinguishes "no brand
            # matched" from "matched, and you need no skein".
            "thread": None,
        }

    def test_thread_brand_is_off_by_default(self) -> None:
        body = self.post()
        assert body["threadBrand"] == "none"
        assert body["stitchesPerSkein"] is None
        assert "Thread" not in body["csv"]
        assert "**Thread brand:**" not in body["markdown"]

    def test_thread_brand_fills_the_legend(self) -> None:
        body = self.post(threadBrand="dmc")
        assert body["threadBrand"] == "dmc"
        assert body["fabricCount"] == 14
        assert body["stitchesPerSkein"] > 0

        black = body["legend"][0]["thread"]
        assert black == {
            "brand": "DMC",
            "code": "310",
            "name": "Black",
            "hex": "#000000",
            "skeins": 1,  # 4 stitches is far below one skein
        }
        assert all(entry["thread"] for entry in body["legend"])

    def test_thread_columns_reach_both_exports(self) -> None:
        body = self.post(threadBrand="dmc")
        assert "Thread brand,DMC" in body["csv"]
        assert "Symbol,Colour,Hex,Stitches,Percent,Thread,Thread name,Skeins" in body["csv"]
        assert "DMC 310,Black,1" in body["csv"]
        assert "- **Thread brand:** DMC" in body["markdown"]
        assert "| Thread | Thread name | Skeins |" in body["markdown"]
        assert "DMC 310 | Black | 1 |" in body["markdown"]

    def test_unused_colour_needs_no_skein(self) -> None:
        # The palette keeps a colour that was painted away completely; it must not
        # tell anybody to buy a skein for it.
        body = self.post(grid=[[0, 1, 1], [0, 0, 1], [0, 0, 0]], threadBrand="dmc")
        entry = next(item for item in body["legend"] if item["index"] == 2)
        assert entry["count"] == 0
        assert entry["thread"]["skeins"] == 0

    def test_skeins_are_the_stitch_count_divided_by_the_skein_yield(self) -> None:
        body = self.post(threadBrand="dmc")
        per_skein = body["stitchesPerSkein"]
        for entry in body["legend"]:
            assert entry["thread"]["skeins"] == math.ceil(entry["count"] / per_skein)

    def test_repeats_are_counted_towards_the_skeins(self) -> None:
        single = self.post(grid=[[0]], palette=[{"hex": "#000000", "count": 1, "label": "Black"}], threadBrand="dmc")
        # 64 x 64 stitches of one colour is 4096 stitches - just under one skein on
        # 14 count. Repeated 4 x 4 that is 16x the thread, so 16 skeins.
        grid = [[0] * 64 for _ in range(64)]
        palette = [{"hex": "#000000", "count": 4096, "label": "Black"}]
        plain = self.post(grid=grid, palette=palette, threadBrand="dmc")
        repeated = self.post(grid=grid, palette=palette, threadBrand="dmc", repeatX=4, repeatY=4)
        assert single["legend"][0]["thread"]["skeins"] == 1
        assert plain["legend"][0]["count"] == 4096
        assert plain["legend"][0]["thread"]["skeins"] == 1
        assert repeated["legend"][0]["count"] == 4096 * 16
        assert repeated["legend"][0]["thread"]["skeins"] == 16

    def test_fabric_count_changes_the_estimate(self) -> None:
        fine = self.post(threadBrand="dmc")["stitchesPerSkein"]
        coarse = self.post(threadBrand="dmc", fabricCount=28)["stitchesPerSkein"]
        # The same skein covers roughly twice as many stitches on 28 count.
        assert 1.9 < coarse / fine < 2.1

    def test_unknown_thread_brand_returns_400(self) -> None:
        response = client.post("/api/pattern", json={**self.PAYLOAD, "threadBrand": "unicorn"})
        assert response.status_code == 400
        assert "unknown thread brand" in response.json()["detail"]

    @pytest.mark.parametrize("fabric_count", [5, 41])
    def test_fabric_count_bounds_are_enforced(self, fabric_count: int) -> None:
        response = client.post(
            "/api/pattern", json={**self.PAYLOAD, "fabricCount": fabric_count}
        )
        assert response.status_code == 422

    def test_brand_list_is_published_in_the_options(self) -> None:
        body = client.get("/api/options").json()
        dmc = next(brand for brand in body["threadBrands"] if brand["id"] == "dmc")
        assert dmc["name"] == "DMC"
        assert dmc["colors"] > 100

    def test_dmc_palette_preset_is_offered(self) -> None:
        body = client.get("/api/palettes").json()
        dmc = next(palette for palette in body["palettes"] if palette["id"] == "dmc")
        labels = [color["label"] for color in dmc["colors"]]
        # Every label is "<code> <name>", so the picker and the legend agree.
        assert "310 Black" in labels
        assert all(label.split(" ", 1)[1] for label in labels)

    def test_repeats_in_camel_case(self) -> None:
        body = self.post(repeatX=4, repeatY=2)
        assert body["totalStitches"] == 72
        assert body["repeatX"] == 4 and body["repeatY"] == 2

    def test_repeats_in_snake_case(self) -> None:
        assert self.post(repeat_x=3)["totalStitches"] == 27

    def test_csv_and_markdown_are_returned(self) -> None:
        body = self.post()
        assert body["csv"].startswith("Mushroom")
        assert body["markdown"].startswith("# Mushroom")

    def test_explicit_symbols_are_respected(self) -> None:
        assert self.post(symbols=["x", "y", "z"])["grid"][2] == ["z", "z", "x"]

    def test_out_of_range_index_returns_400(self) -> None:
        response = client.post("/api/pattern", json={**self.PAYLOAD, "grid": [[0, 1, 9]]})
        assert response.status_code == 400
        assert "does not exist" in response.json()["detail"]

    def test_ragged_grid_returns_400(self) -> None:
        response = client.post("/api/pattern", json={**self.PAYLOAD, "grid": [[0, 1], [0]]})
        assert response.status_code == 400

    def test_missing_fields_return_422(self) -> None:
        assert client.post("/api/pattern", json={"grid": [[0]]}).status_code == 422

    def test_repeat_bounds_are_enforced(self) -> None:
        assert client.post("/api/pattern", json={**self.PAYLOAD, "repeatX": 0}).status_code == 422

    def test_transform_output_can_be_fed_straight_back_in(self) -> None:
        transform = upload(encode(gradient_image(64, 64)), gridWidth=16, maxColors=6)
        pattern = client.post(
            "/api/pattern",
            json={
                "title": "Round trip",
                "grid": transform["grid"],
                "palette": transform["palette"],
                "symbols": transform["symbols"],
                "repeatX": 1,
                "repeatY": 1,
            },
        )
        assert pattern.status_code == 200, pattern.text
        body = pattern.json()
        assert body["width"] == transform["width"]
        assert body["totalStitches"] == transform["width"] * transform["height"]
        assert len(body["legend"]) == len(transform["palette"])

