from __future__ import annotations

import hashlib

import pytest

from deploy.verify_model import main


def test_model_validation_accepts_exact_regular_file(tmp_path, monkeypatch) -> None:
    model = tmp_path / "exact-model.gguf"
    model.write_bytes(b"model-bytes")
    monkeypatch.setenv("LLAMA_MODEL_FILE", str(model))
    monkeypatch.setenv("LLAMA_MODEL_SHA256", hashlib.sha256(b"model-bytes").hexdigest())
    main()


@pytest.mark.parametrize(
    ("path", "checksum"),
    [
        ("<EXACT-MODEL-FILENAME>.gguf", "a" * 64),
        ("/does/not/exist.gguf", "a" * 64),
        ("/does/not/exist.gguf", "<SHA256>"),
    ],
)
def test_model_validation_rejects_placeholder_missing_or_bad_hash(
    path: str, checksum: str, monkeypatch
) -> None:
    monkeypatch.setenv("LLAMA_MODEL_FILE", path)
    monkeypatch.setenv("LLAMA_MODEL_SHA256", checksum)
    with pytest.raises(SystemExit):
        main()
