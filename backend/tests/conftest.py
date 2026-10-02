"""Shared pytest fixtures: small, deterministic sample images."""

from __future__ import annotations

import io
import os
import sys
from typing import List, Tuple

import pytest
from PIL import Image

# Make ``app`` importable when pytest is invoked from anywhere in the repo.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RGB = Tuple[int, int, int]


def encode(image: Image.Image, fmt: str = "PNG") -> bytes:
    """Serialise a Pillow image into bytes."""

    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def solid_image(width: int = 64, height: int = 32, color: RGB = (255, 0, 0)) -> Image.Image:
    return Image.new("RGB", (width, height), color)


def two_tone_image(width: int = 64, height: int = 32) -> Image.Image:
    """Left half navy, right half gold - yields exactly two colours."""

    image = Image.new("RGB", (width, height), (16, 32, 96))
    for x in range(width // 2, width):
        for y in range(height):
            image.putpixel((x, y), (240, 200, 32))
    return image


def gradient_image(width: int = 64, height: int = 64) -> Image.Image:
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for x in range(width):
        for y in range(height):
            pixels[x, y] = (x * 255 // (width - 1), y * 255 // (height - 1), 128)
    return image


def checkerboard_image(size: int = 32, block: int = 4) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for x in range(size):
        for y in range(size):
            dark = ((x // block) + (y // block)) % 2 == 0
            pixels[x, y] = (20, 20, 20) if dark else (240, 240, 240)
    return image


def rgba_image(width: int = 16, height: int = 16) -> Image.Image:
    """Half transparent - used to assert alpha compositing behaviour."""

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for y in range(height):
        for x in range(width):
            image.putpixel((x, y), (0, 255, 0, 255) if x < width // 2 else (0, 0, 0, 0))
    return image


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Give every test an empty rate-limit bucket.

    The limiter is module-level state keyed by client IP, and the test client
    always reports the same one - without this, a few extra requests in an
    unrelated test start returning 429 and the suite fails mysteriously.
    """

    from app import main

    main._rate_buckets.clear()
    yield
    main._rate_buckets.clear()


@pytest.fixture
def png_bytes() -> bytes:
    return encode(two_tone_image())


@pytest.fixture
def jpeg_bytes() -> bytes:
    return encode(two_tone_image(), fmt="JPEG")


@pytest.fixture
def sample_images() -> List[bytes]:
    return [
        encode(solid_image()),
        encode(two_tone_image()),
        encode(gradient_image()),
        encode(checkerboard_image()),
        encode(rgba_image()),
    ]
