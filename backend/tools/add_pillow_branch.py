"""Insert a Pillow >=3.10 branch into the hash-pinned lock.

`pip-compile` resolves for the interpreter it runs under, so a lock generated on
Python 3.9 only contains the `python_version < "3.10"` branch. On Python 3.12 that
branch is skipped entirely and Pillow is never installed.

This adds the complementary `python_version >= "3.10"` branch, with real hashes
fetched from PyPI, so one lock file is valid for both interpreters.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

LOCK = BACKEND / "requirements.lock"
PACKAGE = "pillow"
VERSION = "12.1.1"
MARKER = 'python_version >= "3.10"'


def fetch_hashes(package: str, version: str) -> list[str]:
    url = f"https://pypi.org/pypi/{package}/{version}/json"
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.load(response)

    digests = {entry["digests"]["sha256"] for entry in payload["urls"] if entry.get("digests")}
    if not digests:
        raise SystemExit(f"no sha256 digests published for {package} {version}")
    return sorted(digests)


def main() -> None:
    text = LOCK.read_text()

    if re.search(rf"^{PACKAGE}==.*; {re.escape(MARKER)}", text, re.MULTILINE):
        raise SystemExit(f"branch already present: {PACKAGE}==* ; {MARKER}")

    hashes = fetch_hashes(PACKAGE, VERSION)
    block = [f"{PACKAGE}=={VERSION} ; {MARKER} \\"]
    for index, digest in enumerate(hashes):
        tail = " \\" if index < len(hashes) - 1 else ""
        block.append(f"    --hash=sha256:{digest}{tail}")
    block.append("    # via -r requirements.txt")
    new_entry = "\n".join(block)

    # Insert straight after the existing pillow block (and its "# via" line).
    pattern = re.compile(
        rf"^{PACKAGE}==.*?# via [^\n]*\n",
        re.MULTILINE | re.DOTALL,
    )
    updated, count = pattern.subn(lambda match: match.group(0) + new_entry + "\n", text, count=1)
    if count != 1:
        raise SystemExit(f"could not locate the existing {PACKAGE} block")

    LOCK.write_text(updated)
    print(f"added {PACKAGE}=={VERSION} ; {MARKER} with {len(hashes)} hashes")


if __name__ == "__main__":
    main()