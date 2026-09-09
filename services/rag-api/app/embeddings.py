from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any, Protocol


class TextTokenizer(Protocol):
    def encode(self, text: str) -> list[int]: ...

    def decode(self, token_ids: Sequence[int]) -> str: ...


class EmbeddingProvider(ABC):
    dimension: int

    @property
    @abstractmethod
    def tokenizer(self) -> TextTokenizer:
        raise NotImplementedError

    @property
    @abstractmethod
    def ready(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def load(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def embed_many(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError

    async def embed_query(self, text: str) -> list[float]:
        """Embed retrieval queries; simple providers may use the generic fallback."""
        return await self.embed(text)

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed corpus documents; simple providers may use the generic fallback."""
        return await self.embed_many(texts)

    async def embed(self, text: str) -> list[float]:
        vectors = await self.embed_many([text])
        return vectors[0]

    async def close(self) -> None:
        return None

    def count_tokens(self, text: str) -> int:
        return len(self.tokenizer.encode(text))


class _SentenceTransformerTokenizer:
    def __init__(self, tokenizer: Any) -> None:
        self._tokenizer = tokenizer

    def encode(self, text: str) -> list[int]:
        return list(self._tokenizer.encode(text, add_special_tokens=False))

    def decode(self, token_ids: Sequence[int]) -> str:
        return str(
            self._tokenizer.decode(
                list(token_ids),
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )
        )


class SentenceTransformerEmbedding(EmbeddingProvider):
    """EmbeddingGemma adapter with one serialized model instance per process."""

    def __init__(self, model_id: str, dimension: int = 768) -> None:
        self.model_id = model_id
        self.dimension = dimension
        self._model: Any | None = None
        self._tokenizer: TextTokenizer | None = None
        self._inference_lock = asyncio.Lock()

    @property
    def tokenizer(self) -> TextTokenizer:
        if self._tokenizer is None:
            raise RuntimeError("embedding model is not loaded")
        return self._tokenizer

    @property
    def ready(self) -> bool:
        return self._model is not None and self._tokenizer is not None

    async def load(self) -> None:
        if self.ready:
            return
        await asyncio.to_thread(self._load_sync)

    def _load_sync(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:  # pragma: no cover - deployment guard
            raise RuntimeError("sentence-transformers is required for EmbeddingGemma") from exc

        model = SentenceTransformer(self.model_id, trust_remote_code=False)
        get_dimension = getattr(model, "get_embedding_dimension", None)
        if get_dimension is None:  # pragma: no cover - compatibility with older 5.x runtimes
            get_dimension = model.get_sentence_embedding_dimension
        dimension = get_dimension()
        if dimension != self.dimension:
            raise RuntimeError(
                f"embedding dimension mismatch: expected {self.dimension}, model returned {dimension}"
            )
        if getattr(model, "tokenizer", None) is None:
            raise RuntimeError("embedding model did not expose a tokenizer")
        self._model = model
        self._tokenizer = _SentenceTransformerTokenizer(model.tokenizer)

    async def embed_many(self, texts: Sequence[str]) -> list[list[float]]:
        return await self._encode_many(texts, method_name="encode")

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self._encode_many([text], method_name="encode_query")
        return vectors[0]

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return await self._encode_many(texts, method_name="encode_document")

    async def _encode_many(
        self,
        texts: Sequence[str],
        *,
        method_name: str,
    ) -> list[list[float]]:
        if not texts:
            return []
        if not self.ready:
            raise RuntimeError("embedding model is not loaded")
        clean = [text.strip() for text in texts]
        if any(not text for text in clean):
            raise ValueError("cannot embed an empty string")
        encode_method = getattr(self._model, method_name, None)
        if encode_method is None:
            raise RuntimeError(
                f"embedding runtime does not support required {method_name}; install the pinned runtime"
            )
        async with self._inference_lock:
            result = await asyncio.to_thread(
                encode_method,
                clean,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        vectors = result.tolist()
        if any(len(vector) != self.dimension for vector in vectors):
            raise RuntimeError("embedding runtime returned an unexpected dimension")
        return [[float(value) for value in vector] for vector in vectors]
