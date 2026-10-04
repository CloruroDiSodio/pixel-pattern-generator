"""Pixel Art & Pattern Generator backend package.

The package is intentionally split into three modules:

* ``utils``     – pure colour/formatting helpers (no third-party imports).
* ``processor`` – Pillow powered image processing and matrix generation.
* ``main``      – the FastAPI application exposing the HTTP API.
"""

__version__ = "1.3.0"

__all__ = ["__version__"]
