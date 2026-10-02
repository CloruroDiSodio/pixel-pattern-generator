"""Integration tests for the HTTP layer (``app.main``)."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

from app.main import app
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

    def test_cors_preflight_is_allowed(self) -> None:
        response = client.options(
            "/api/transform",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "*"

    def test_openapi_schema_is_generated(self) -> None:
        assert "/api/transform" in client.get("/openapi.json").json()["paths"]


class TestTransformEndpoint:
    def test_defaults_are_applied_when_only_a_file_is_sent(self) -> None:
        body = upload()
        assert body["width"] == 32
        assert body["height"] == 16
        assert body["originalWidth"] == 64
        assert body["originalHeight"] == 32
        assert len(body["palette"]) == 1
        assert body["previewPng"].startswith("data:image/png;base64,")
        assert body["processingMs"] >= 0

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
        assert upload(gridWidth=8, previewScale=6, gridLines=False)["previewPng"]
        assert upload(gridWidth=8, previewScale=6, gridLines=True)["previewPng"]

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
        }

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

