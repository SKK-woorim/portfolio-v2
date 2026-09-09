from __future__ import annotations

from collections.abc import Sequence

import pytest

from app.config import Settings
from app.embeddings import EmbeddingProvider, TextTokenizer


class CharTokenizer:
    def encode(self, text: str) -> list[int]:
        return [ord(char) for char in text]

    def decode(self, token_ids: Sequence[int]) -> str:
        return "".join(chr(token) for token in token_ids)


class FakeEmbedding(EmbeddingProvider):
    dimension = 768

    def __init__(self) -> None:
        self._tokenizer = CharTokenizer()
        self.loaded = True

    @property
    def tokenizer(self) -> TextTokenizer:
        return self._tokenizer

    @property
    def ready(self) -> bool:
        return self.loaded

    async def load(self) -> None:
        self.loaded = True

    async def embed_many(self, texts: Sequence[str]) -> list[list[float]]:
        return [[1.0] + [0.0] * 767 for _ in texts]

    async def close(self) -> None:
        self.loaded = False


@pytest.fixture
def settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role-secret-value",
        chat_backend_secret="backend-hmac-secret-value",
        llama_model_id="pinned-gemma-model",
        embedding_model_id="google/embeddinggemma-300m",
        rag_match_threshold=0.5,
        chat_heartbeat_seconds=1,
    )
