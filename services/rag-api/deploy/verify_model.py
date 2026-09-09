"""Fail a llama.cpp systemd start when the pinned model is absent or changed."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

PLACEHOLDERS = {"", "placeholder", "replace-me", "<required>"}


def main() -> None:
    raw_path = os.environ.get("LLAMA_MODEL_FILE", "").strip()
    expected = os.environ.get("LLAMA_MODEL_SHA256", "").strip().lower()
    if raw_path.lower() in PLACEHOLDERS or "<" in raw_path or ">" in raw_path:
        raise SystemExit("LLAMA_MODEL_FILE must be an exact, non-placeholder path")
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or expected == "0" * 64:
        raise SystemExit("LLAMA_MODEL_SHA256 must be the publisher-verified SHA-256")

    path = Path(raw_path)
    if not path.is_file() or path.is_symlink():
        raise SystemExit("LLAMA_MODEL_FILE must be a regular, non-symlink file")
    digest = hashlib.sha256()
    with path.open("rb") as model:
        for block in iter(lambda: model.read(1024 * 1024), b""):
            digest.update(block)
    actual = digest.hexdigest()
    if actual != expected:
        raise SystemExit(f"model checksum mismatch: expected {expected}, got {actual}")
    print(f"verified model {path.name} sha256={actual}")


if __name__ == "__main__":
    main()
