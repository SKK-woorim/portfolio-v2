from __future__ import annotations

import json
from uuid import uuid4

import httpx
import pytest

from app.retrieval import SupabaseRetriever
from worker.models import ChunkRecord
from worker.repository import SupabaseSyncRepository


@pytest.mark.asyncio
async def test_retriever_uses_database_rpc_parameter_contract() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/rpc/match_knowledge_chunks"
        payload = json.loads(request.content)
        assert payload == {"p_query_embedding": [1.0, 0.0], "p_match_count": 12}
        return httpx.Response(
            200,
            json=[
                {
                    "chunk_id": str(uuid4()),
                    "document_id": str(uuid4()),
                    "revision_id": str(uuid4()),
                    "source_type": "post",
                    "title": "RAG 글",
                    "source_url": "/blog/rag-post",
                    "content": "공개 근거",
                    "token_count": 20,
                    "metadata": {"tags": ["RAG"]},
                    "similarity": 0.9,
                }
            ],
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        retriever = SupabaseRetriever(
            "https://example.supabase.co",
            "secret",
            threshold=0.5,
            client=client,
        )
        result = await retriever.search("RAG", [1.0, 0.0])
    assert len(result.chunks) == 1


@pytest.mark.asyncio
async def test_worker_uses_claim_complete_and_fail_rpc_contract() -> None:
    calls: list[tuple[str, dict[str, object]]] = []
    document_id = str(uuid4())
    revision_id = str(uuid4())

    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content) if request.content else {}
        calls.append((request.url.path, payload))
        if request.url.path.endswith("/claim_knowledge_sync_job"):
            return httpx.Response(
                200,
                json=[
                    {
                        "job_id": 7,
                        "document_id": document_id,
                        "revision_id": revision_id,
                        "action": "upsert",
                        "attempt_count": 1,
                        "source_type": "post",
                        "source_id": str(uuid4()),
                        "source_slug": "rag-post",
                        "title": "RAG 글",
                        "source_url": "/blog/rag-post",
                        "source_updated_at": "2026-01-01T00:00:00Z",
                    }
                ],
            )
        if request.url.path.endswith("/complete_knowledge_sync_job"):
            return httpx.Response(200, json={"completed": True, "reason": "activated"})
        if request.url.path.endswith("/fail_knowledge_sync_job"):
            return httpx.Response(200, json={"failed": True, "reason": "retry_scheduled"})
        raise AssertionError(request.url.path)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        repository = SupabaseSyncRepository(
            "https://example.supabase.co",
            "secret",
            "worker-1",
            client=client,
        )
        job = await repository.claim()
        assert job is not None
        chunk = ChunkRecord(
            chunk_index=0,
            heading="본문",
            content="공개 근거",
            token_count=20,
            embedding=[0.0] * 768,
            metadata={"tags": ["RAG"]},
        )
        await repository.complete(job, content_hash="a" * 64, chunks=[chunk])
        await repository.fail(job, "RuntimeError: synchronization step failed")

    assert calls[0] == (
        "/rest/v1/rpc/claim_knowledge_sync_job",
        {"p_worker_id": "worker-1", "p_lock_timeout_seconds": 600},
    )
    assert calls[1][1].keys() == {
        "p_job_id",
        "p_worker_id",
        "p_revision_id",
        "p_content_hash",
        "p_chunks",
    }
    assert calls[1][1]["p_chunks"][0].keys() == {
        "chunk_index",
        "heading",
        "content",
        "token_count",
        "embedding",
        "metadata",
    }
    assert calls[2][1] == {
        "p_job_id": 7,
        "p_worker_id": "worker-1",
        "p_revision_id": revision_id,
        "p_error": "RuntimeError: synchronization step failed",
    }
