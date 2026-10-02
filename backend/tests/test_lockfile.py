"""Tests that keep the deployment artifacts consistent with the code."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
LOCK = BACKEND / "requirements.lock"
REQUIREMENTS = BACKEND / "requirements.txt"


def _lock_branch_hashes(package: str, marker: str) -> list[str]:
    text = LOCK.read_text()
    match = re.search(
        rf"^{package}==[^\\\n]*; {re.escape(marker)} \\\n(.*?)(?=^\S|\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    assert match, f"{package} has no branch marked '{marker}' in requirements.lock"
    return re.findall(r"--hash=sha256:([0-9a-f]{64})", match.group(1))


class TestPinnedLockFile:
    """`pip-compile` resolves for the interpreter it runs under.

    A lock generated on Python 3.9 therefore only carries the
    `python_version < "3.10"` Pillow branch. On a Python 3.12 host that branch is
    skipped by the marker evaluator and Pillow is never installed at all - the
    build succeeds and then the process dies with
    `ModuleNotFoundError: No module named 'PIL'`. See the Render deploy log.

    These tests fail loudly instead.
    """

    def test_lock_file_exists(self) -> None:
        assert LOCK.is_file(), "requirements.lock is missing"

    def test_lock_has_a_pillow_branch_for_both_python_ranges(self) -> None:
        older = _lock_branch_hashes("pillow", 'python_version < "3.10"')
        newer = _lock_branch_hashes("pillow", 'python_version >= "3.10"')
        assert older, "no Pillow branch for Python < 3.10"
        assert newer, "no Pillow branch for Python >= 3.10"

    def test_lock_branches_match_the_markers_in_requirements(self) -> None:
        declared = re.findall(r"^pillow==([0-9.]+); (\S+ \S+ .+)$", REQUIREMENTS.read_text(), re.MULTILINE)
        assert declared, "requirements.txt no longer pins Pillow with environment markers"
        for _version, marker in declared:
            assert _lock_branch_hashes("pillow", marker.strip()), (
                f"requirements.txt declares '{marker}' but requirements.lock has no such branch"
            )

    def test_newer_pillow_branch_is_the_patched_release(self) -> None:
        # CVE-2026-25990 (out-of-bounds write decoding PSD) is fixed in 12.1.1.
        text = LOCK.read_text()
        newer = re.search(r'^pillow==([0-9.]+) ; python_version >= "3\.10"', text, re.MULTILINE)
        assert newer, "no Pillow branch for Python >= 3.10"
        major, minor, patch = (int(part) for part in newer.group(1).split("."))
        assert (major, minor, patch) >= (12, 1, 1), (
            f"Python 3.10+ resolves to Pillow {newer.group(1)}, which is inside the "
            "CVE-2026-25990 range (fixed in 12.1.1)"
        )

    @pytest.mark.parametrize(
        "package", ["fastapi", "uvicorn", "python-multipart", "pydantic"]
    )
    def test_runtime_dependencies_are_locked_and_hashed(self, package: str) -> None:
        text = LOCK.read_text()
        # pip-compile records extras inline: ``uvicorn[standard]==0.32.1``.
        pinned = re.search(rf"^{re.escape(package)}(\[[^\]]+\])?==", text, re.MULTILINE)
        assert pinned, f"{package} is not locked"
        assert "--hash=sha256:" in text, "lock has no hashes - run pip-compile --generate-hashes"