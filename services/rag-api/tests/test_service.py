from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from conftest import FakeEmbedding

from app.contracts import ChatRequest
from app.generation import GenerationDelta
from app.queue import GenerationGate
from app.retrieval import RetrievalCandidate, RetrievalResult
from app.service import ChatService


def context_result() -> RetrievalResult:
    return RetrievalResult(
        (
            RetrievalCandidate(
                chunk_id="chunk",
                document_id="doc",
                revision_id="rev",
                active_revision="rev",
                index_status="ready",
                source_type="portfolio",
                title="RAG 프로젝트",
                source_url="/portfolio/rag-project",
                content="공개된 근거 본문",
                token_count=20,
                similarity=0.9,
            ),
        )
    )


class Retriever:
    async def search(self, query, query_embedding):
        return context_result()

    async def close(self):
        return None


class ImmediateGenerator:
    async def stream(self, messages):
        yield GenerationDelta(content="근거 답변 [S1]")
        yield GenerationDelta(finish_reason="unexpected-runtime-reason")

    async def close(self):
        return None


class SlowGenerator:
    async def stream(self, messages):
        await asyncio.sleep(10)
        yield GenerationDelta(content="late")

    async def close(self):
        return None


def request() -> ChatRequest:
    return ChatRequest.model_validate(
        {"sessionId": str(uuid4()), "message": "RAG 프로젝트?", "history": []}
    )


@pytest.mark.asyncio
async def test_success_stream_echoes_request_id_and_normalizes_finish_reason(settings) -> None:
    request_id = uuid4()
    service = ChatService(
        settings,
        FakeEmbedding(),
        Retriever(),
        ImmediateGenerator(),
        GenerationGate(),
    )
    frames = b"".join([frame async for frame in service.stream(request(), request_id)]).decode()
    assert "event: sources" in frames
    assert "event: token" in frames
    assert f'"requestId":"{request_id}"' in frames
    assert '"finishReason":"stop"' in frames


@pytest.mark.asyncio
async def test_chat_search_uses_query_embedding_mode(settings) -> None:
    class ModeEmbedding(FakeEmbedding):
        query_calls = 0
        document_calls = 0

        async def embed_query(self, text):
            self.query_calls += 1
            return await super().embed_query(text)

        async def embed_documents(self, texts):
            self.document_calls += 1
            return await super().embed_documents(texts)

    embeddings = ModeEmbedding()
    service = ChatService(
        settings,
        embeddings,
        Retriever(),
        ImmediateGenerator(),
        GenerationGate(),
    )
    _ = [frame async for frame in service.stream(request(), uuid4())]
    assert embeddings.query_calls == 1
    assert embeddings.document_calls == 0


@pytest.mark.asyncio
async def test_first_token_timeout_emits_contract_error_and_releases_gate(settings) -> None:
    fast_timeout = settings.model_copy(
        update={"chat_first_token_timeout_ms": 100, "chat_total_timeout_ms": 1000}
    )
    gate = GenerationGate()
    service = ChatService(
        fast_timeout,
        FakeEmbedding(),
        Retriever(),
        SlowGenerator(),
        gate,
    )
    frames = b"".join([frame async for frame in service.stream(request(), uuid4())]).decode()
    assert '"code":"FIRST_TOKEN_TIMEOUT"' in frames
    assert (await gate.snapshot()).running == 0


@pytest.mark.asyncio
async def test_cancelled_queue_wait_is_removed(settings) -> None:
    gate = GenerationGate()
    await gate.acquire()
    service = ChatService(
        settings,
        FakeEmbedding(),
        Retriever(),
        ImmediateGenerator(),
        gate,
    )

    async def consume() -> None:
        async for _ in service.stream(request(), uuid4()):
            pass

    task = asyncio.create_task(consume())
    for _ in range(20):
        if (await gate.snapshot()).waiting == 1:
            break
        await asyncio.sleep(0)
    assert (await gate.snapshot()).waiting == 1
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await gate.snapshot()).waiting == 0
    await gate.release()
