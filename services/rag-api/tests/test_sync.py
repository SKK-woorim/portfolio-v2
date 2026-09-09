from __future__ import annotations

from dataclasses import dataclass

import pytest
from conftest import FakeEmbedding

from worker.models import ClaimedJob, SourceDocument
from worker.sync import SyncWorker


def make_job(action: str = "upsert", revision: str = "rev-1") -> ClaimedJob:
    return ClaimedJob(
        job_id=1,
        document_id="doc-1",
        revision_id=revision,
        action=action,  # type: ignore[arg-type]
        attempt_count=1,
        source_type="post",
        source_id="source-1",
        source_slug="rag-post",
        title="RAG 글",
        source_url="/blog/rag-post",
        source_updated_at="2026-01-01T00:00:00Z",
    )


class FakeRepository:
    def __init__(self, job: ClaimedJob | None, desired: list[str | None]) -> None:
        self.job = job
        self.desired = desired
        self.completed: list[tuple[object, object]] = []
        self.failed: list[str] = []

    async def claim(self) -> ClaimedJob | None:
        job, self.job = self.job, None
        return job

    async def desired_revision(self, _: str) -> str | None:
        return self.desired.pop(0) if len(self.desired) > 1 else self.desired[0]

    async def complete(self, job: ClaimedJob, *, content_hash=None, chunks=None):
        self.completed.append((content_hash, chunks))
        return {"status": "ready"}

    async def fail(self, job: ClaimedJob, error: str):
        self.failed.append(error)
        return {"status": "queued"}


@dataclass
class FakeLoader:
    source: SourceDocument | None = None
    error: Exception | None = None
    calls: int = 0

    async def load(self, _: ClaimedJob) -> SourceDocument:
        self.calls += 1
        if self.error:
            raise self.error
        assert self.source is not None
        return self.source


def source() -> SourceDocument:
    return SourceDocument(
        source_type="post",
        source_id="source-1",
        slug="rag-post",
        title="RAG 글",
        source_url="/blog/rag-post",
        updated_at="2026-01-01",
        status="published",
        fields={
            "summary": "RAG 요약",
            "category": "AI",
            "published_at": "2026-01-01",
            "content": "근거가 있는 긴 본문입니다. " * 100,
        },
        tags=("RAG",),
    )


@pytest.mark.asyncio
async def test_stale_claim_is_completed_without_loading_source() -> None:
    repo = FakeRepository(make_job(), ["rev-2"])
    loader = FakeLoader(source())
    assert await SyncWorker(repo, loader, FakeEmbedding()).process_once()
    assert loader.calls == 0
    assert repo.completed == [(None, None)]


@pytest.mark.asyncio
async def test_upsert_verifies_twice_embeds_and_activates_atomically() -> None:
    class ModeEmbedding(FakeEmbedding):
        document_calls = 0

        async def embed_documents(self, texts):
            self.document_calls += 1
            return await super().embed_documents(texts)

    repo = FakeRepository(make_job(), ["rev-1", "rev-1"])
    loader = FakeLoader(source())
    embeddings = ModeEmbedding()
    await SyncWorker(repo, loader, embeddings).process_once()
    content_hash, chunks = repo.completed[0]
    assert len(content_hash) == 64
    assert chunks and all(len(chunk.embedding or []) == 768 for chunk in chunks)
    assert embeddings.document_calls == 1
    assert not repo.failed


@pytest.mark.asyncio
async def test_revision_changed_during_embedding_never_activates_old_chunks() -> None:
    repo = FakeRepository(make_job(), ["rev-1", "rev-2"])
    await SyncWorker(repo, FakeLoader(source()), FakeEmbedding()).process_once()
    assert repo.completed == [(None, None)]


@pytest.mark.asyncio
async def test_disable_completes_without_loading_or_embedding() -> None:
    repo = FakeRepository(make_job("disable"), ["rev-1"])
    loader = FakeLoader(source())
    await SyncWorker(repo, loader, FakeEmbedding()).process_once()
    assert loader.calls == 0
    assert repo.completed == [(None, None)]


@pytest.mark.asyncio
async def test_failure_uses_sanitized_error_and_db_retry_flow() -> None:
    repo = FakeRepository(make_job(), ["rev-1"])
    loader = FakeLoader(error=RuntimeError("raw private content and secret"))
    await SyncWorker(repo, loader, FakeEmbedding()).process_once()
    assert repo.failed == ["RuntimeError: synchronization step failed"]
    assert "private" not in repo.failed[0]
