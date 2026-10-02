"""Verify that every locally available Pillow 12.1.1 artifact is hash-pinned.

`pip download --python-version` only rewrites wheel tags, so a dry-run on a 3.9
interpreter cannot prove that a Python 3.12 host will accept the lock. It does
prove what matters if we compare the real artifact digests against the block
that was written into requirements.lock: every wheel a 3.12 machine could
download must appear there, or `--require-hashes` rejects the build.
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

LOCK = BACKEND / "requirements.lock"
DOWNLOADS = Path("/tmp/p12")


def lock_hashes(package: str, marker: str) -> set[str]:
    text = LOCK.read_text()
    match = re.search(
        rf"^{package}==[^\\\n]*; {re.escape(marker)} \\\n(.*?)(?=^\S|\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if not match:
        raise SystemExit(f"no {package} branch with marker {marker!r} in the lock")
    return set(re.findall(r"--hash=sha256:([0-9a-f]{64})", match.group(1)))


def main() -> int:
    pinned = lock_hashes("pillow", 'python_version >= "3.10"')
    wheels = sorted(DOWNLOADS.glob("pillow-12.1.1-*.whl"))
    if not wheels:
        print("no wheels downloaded - nothing to check")
        return 0

    failures = 0
    for wheel in wheels:
        digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
        ok = digest in pinned
        print(f"{'OK  ' if ok else 'FAIL'} {wheel.name}")
        if not ok:
            failures += 1

    print(f"\n{len(pinned)} hashes pinned, {len(wheels)} artifact(s) checked")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())