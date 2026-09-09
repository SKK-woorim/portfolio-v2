from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

SourceType = Literal["profile", "portfolio", "post"]
JobAction = Literal["upsert", "disable", "delete"]


@dataclass(frozen=True)
class ClaimedJob:
    job_id: int
    document_id: str
    revision_id: str
    action: JobAction
    attempt_count: int
    source_type: SourceType
    source_id: str
    source_slug: str | None
    title: str
    source_url: str
    source_updated_at: str


@dataclass(frozen=True)
class SourceDocument:
    source_type: SourceType
    source_id: str
    slug: str | None
    title: str
    source_url: str
    updated_at: str
    status: str
    fields: dict[str, Any]
    tags: tuple[str, ...] = ()

    @property
    def is_public(self) -> bool:
        return self.source_type == "profile" or self.status == "published"


@dataclass(frozen=True)
class ChunkRecord:
    chunk_index: int
    heading: str | None
    content: str
    token_count: int
    metadata: dict[str, Any] = field(default_factory=dict)
    embedding: list[float] | None = None

    def to_rpc(self) -> dict[str, Any]:
        if self.embedding is None:
            raise ValueError("chunk must be embedded before activation")
        return {
            "chunk_index": self.chunk_index,
            "heading": self.heading,
            "content": self.content,
            "token_count": self.token_count,
            "embedding": self.embedding,
            "metadata": self.metadata,
        }
