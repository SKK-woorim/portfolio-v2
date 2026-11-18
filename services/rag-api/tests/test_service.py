from __future__ import annotations

import asyncio
import json
from itertools import permutations
from uuid import uuid4

import httpx
import pytest
from conftest import FakeEmbedding

from app.contracts import ChatRequest
from app.generation import GenerationDelta, LlamaCppClient
from app.main import ChatStreamingResponse
from app.provider_logging import ProviderLogSink
from app.queue import GenerationGate
from app.remote_generation import RemoteGeneration
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
    async def stream(self, messages, attempt=None):
        yield GenerationDelta(content="근거 답변 [S1]")
        yield GenerationDelta(finish_reason="unexpected-runtime-reason")

    async def close(self):
        return None


class SlowGenerator:
    async def stream(self, messages, attempt=None):
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


@pytest.mark.parametrize("remote_answer", [True, False])
async def test_remote_answer_or_local_fallback_reuses_retrieved_context(settings, remote_answer):
    class Remote:
        async def load_routing(self, call_log, timeout):
            return ("openai", "local"), {"openai": "test-key"}

        async def generate(self, provider, messages, api_key, call_log, budget):
            assert "공개된 근거 본문" in messages[-1]["content"]
            if remote_answer:
                return GenerationDelta("원격 근거 답변 [S1]", "stop")
            return None

    service = ChatService(
        settings,
        FakeEmbedding(),
        Retriever(),
        ImmediateGenerator(),
        GenerationGate(),
        Remote(),
    )
    request_id = uuid4()
    frames = b"".join([frame async for frame in service.stream(request(), request_id)]).decode()
    assert "event: sources" in frames
    assert frames.count("event: token") == 1
    expected = "원격 근거 답변 [S1]" if remote_answer else "근거 답변 [S1]"
    assert f'"delta":"{expected}"' in frames
    assert f'"requestId":"{request_id}"' in frames
    assert "event: error" not in frames


@pytest.mark.parametrize(
    ("keys", "expected_providers", "lookup_status"),
    [
        (["openai", "gemini"], ["openai", "gemini", "local"], None),
        (["gemini"], ["gemini", "local"], "missing_openai"),
        ([], ["local"], "missing_both"),
        (None, ["local"], "failed"),
    ],
)
async def test_provider_log_records_actual_attempts_and_safe_metadata(
    settings, keys, expected_providers, lookup_status
):
    payloads = []

    def handle(req):
        if req.url.path.endswith("/get_ai_provider_configuration"):
            if keys is None:
                return httpx.Response(503)
            return httpx.Response(
                200,
                json={
                    "provider_order": ["openai", "gemini", "local"],
                    "keys": [{"provider": provider, "api_key": "secret-key"} for provider in keys],
                },
            )
        if req.url.path.endswith("/get_ai_provider_keys"):
            if keys is None:
                return httpx.Response(503)
            return httpx.Response(
                200,
                json=[{"provider": provider, "api_key": "secret-key"} for provider in keys],
            )
        if req.url.path.endswith("/record_chatbot_call_log"):
            payloads.append(json.loads(req.content))
            return httpx.Response(204)
        if req.url.host == "api.openai.com":
            return httpx.Response(429, json={"error": "private error body"})
        if req.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(
                200,
                json={
                    "candidates": [{"finishReason": "MAX_TOKENS"}],
                    "usageMetadata": {
                        "promptTokenCount": 12,
                        "candidatesTokenCount": 2,
                        "totalTokenCount": 14,
                    },
                },
            )
        assert json.loads(req.content)["stream_options"] == {"include_usage": True}
        return httpx.Response(
            200,
            text='data: {"choices":[{"delta":{"content":"private answer"},"finish_reason":null}]}\n\n'
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            'data: {"choices":[],"usage":'
            '{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n'
            "data: [DONE]\n\n",
        )

    request_id = uuid4()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        service = ChatService(
            settings,
            FakeEmbedding(),
            Retriever(),
            LlamaCppClient(settings.llama_base_url, settings.llama_model_id, client=client),
            GenerationGate(),
            RemoteGeneration(settings, client),
            ProviderLogSink(settings, client),
        )
        frames = b"".join([frame async for frame in service.stream(request(), request_id)])
        await service.close()

    assert b"private answer" in frames
    assert len(payloads) == 1
    payload = payloads[0]
    assert payload["p_request_id"] == str(request_id)
    assert payload["p_key_lookup_status"] == lookup_status
    attempts = payload["p_attempts"]
    assert [entry["provider"] for entry in attempts] == expected_providers
    for entry in attempts:
        assert entry["started_at"]
        assert entry["duration_ms"] >= 0
    by_provider = {entry["provider"]: entry for entry in attempts}
    if "openai" in by_provider:
        assert by_provider["openai"]["model"] == settings.openai_model_id
        assert by_provider["openai"]["http_status"] == 429
        assert by_provider["openai"]["error_class"] == "HTTPStatusError"
    if "gemini" in by_provider:
        assert by_provider["gemini"]["status"] == "error"
        assert by_provider["gemini"]["error_class"] == "IncompleteResponse"
        assert by_provider["gemini"]["total_tokens"] == 14
    assert by_provider["local"]["status"] == "success"
    assert by_provider["local"]["model"] == settings.llama_model_id
    assert by_provider["local"]["http_status"] == 200
    assert by_provider["local"]["total_tokens"] == 10
    for private in ["secret-key", "private error body", "private answer", "공개된 근거 본문"]:
        assert private not in str(payload)


async def test_provider_log_write_does_not_delay_sse_or_fail_chat(settings, caplog):
    first_write = asyncio.Event()
    allow_write = asyncio.Event()

    async def handle(_):
        first_write.set()
        await allow_write.wait()
        return httpx.Response(503, text="private error body")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        service = ChatService(
            settings,
            FakeEmbedding(),
            Retriever(),
            ImmediateGenerator(),
            GenerationGate(),
            provider_logs=ProviderLogSink(settings, client),
        )

        async def produce():
            return b"".join([frame async for frame in service.stream(request(), uuid4())])

        assert b"event: done" in await asyncio.wait_for(produce(), timeout=1)
        await asyncio.wait_for(first_write.wait(), timeout=1)
        allow_write.set()
        await service.close()
    assert "HTTPStatusError" in caplog.text
    assert "private error body" not in caplog.text


async def test_disconnect_during_token_send_finalizes_local_attempt(settings):
    payloads = []

    def handle(req):
        payloads.append(json.loads(req.content))
        return httpx.Response(204)

    async def send(message):
        if b"event: token" in message.get("body", b""):
            raise OSError("test disconnect")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        gate = GenerationGate()
        service = ChatService(
            settings,
            FakeEmbedding(),
            Retriever(),
            ImmediateGenerator(),
            gate,
            provider_logs=ProviderLogSink(settings, client),
        )
        response = ChatStreamingResponse(service.stream(request(), uuid4()))
        with pytest.raises(OSError, match="test disconnect"):
            await response.stream_response(send)
        assert (await gate.snapshot()).running == 0
        await service.close()

    assert len(payloads) == 1
    assert [attempt["status"] for attempt in payloads[0]["p_attempts"]] == ["cancelled"]


@pytest.mark.parametrize("expire_budget", [False, True])
async def test_remote_attempt_status_and_usage(settings, expire_budget):
    if expire_budget:
        settings = settings.model_copy(
            update={"chat_first_token_timeout_ms": 900, "chat_total_timeout_ms": 1000}
        )
    payloads = []

    async def handle(req):
        if req.url.path.endswith("/get_ai_provider_configuration"):
            return httpx.Response(
                200,
                json={
                    "provider_order": ["openai", "gemini", "local"],
                    "keys": [{"provider": "openai", "api_key": "key"}],
                },
            )
        if req.url.path.endswith("/record_chatbot_call_log"):
            payloads.append(json.loads(req.content))
            return httpx.Response(204)
        assert req.url.host == "api.openai.com"
        if expire_budget:
            await asyncio.sleep(10)
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": "답변"}]}
                ],
                "usage": {"input_tokens": 9, "output_tokens": 2, "total_tokens": 11},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        service = ChatService(
            settings,
            FakeEmbedding(),
            Retriever(),
            ImmediateGenerator(),
            GenerationGate(),
            RemoteGeneration(settings, client),
            ProviderLogSink(settings, client),
        )
        frames = b"".join([frame async for frame in service.stream(request(), uuid4())])
        await service.close()

    assert b"event: done" in frames
    assert len(payloads) == 1
    attempts = payloads[0]["p_attempts"]
    if expire_budget:
        assert [attempt["provider"] for attempt in attempts] == ["openai", "local"]
        assert attempts[0]["status"] == "timeout"
        assert attempts[0]["error_class"] == "RemoteBudgetTimeout"
        assert attempts[0]["http_status"] is None
    else:
        assert [attempt["provider"] for attempt in attempts] == ["openai"]
        assert attempts[0]["status"] == "success"
        assert attempts[0]["http_status"] == 200
        assert attempts[0]["total_tokens"] == 11


@pytest.mark.parametrize("order", list(permutations(("openai", "gemini", "local"))))
async def test_provider_order_controls_attempts_and_discards_partial_local_answer(settings, order):
    calls = []
    payloads = []
    winner = order[-1]

    class Local(ImmediateGenerator):
        async def stream(self, messages, attempt=None):
            calls.append("local")
            if winner == "local":
                yield GenerationDelta(content="local won", finish_reason="stop")
            else:
                yield GenerationDelta(content="discarded partial answer")

    def handle(req):
        if req.url.path.endswith("/get_ai_provider_configuration"):
            assert json.loads(req.content) == {"p_include_values": True}
            return httpx.Response(
                200,
                json={
                    "provider_order": order,
                    "keys": [
                        {"provider": provider, "api_key": "key"}
                        for provider in ("openai", "gemini")
                    ],
                },
            )
        if req.url.path.endswith("/record_chatbot_call_log"):
            payloads.append(json.loads(req.content))
            return httpx.Response(204)
        provider = "openai" if req.url.host == "api.openai.com" else "gemini"
        calls.append(provider)
        if provider != winner:
            return httpx.Response(503)
        if provider == "openai":
            return httpx.Response(
                200,
                json={
                    "status": "completed",
                    "output": [
                        {
                            "type": "message",
                            "content": [{"type": "output_text", "text": "openai won"}],
                        }
                    ],
                },
            )
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "STOP", "content": {"parts": [{"text": "gemini won"}]}}
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        service = ChatService(
            settings,
            FakeEmbedding(),
            Retriever(),
            Local(),
            GenerationGate(),
            RemoteGeneration(settings, client),
            ProviderLogSink(settings, client),
        )
        frames = b"".join([frame async for frame in service.stream(request(), uuid4())]).decode()
        await service.close()

    assert calls == list(order)
    assert f"{winner} won" in frames
    assert "discarded partial answer" not in frames
    assert frames.count("event: token") == 1
    assert frames.count("event: done") == 1
    assert "event: error" not in frames
    assert len(payloads) == 1
    attempts = payloads[0]["p_attempts"]
    assert [attempt["provider"] for attempt in attempts] == list(order)
    assert [attempt["status"] for attempt in attempts] == ["error", "error", "success"]


@pytest.mark.parametrize("local_busy", [True, False])
async def test_local_first_either_wins_or_skips_a_busy_gate(settings, local_busy):
    class Local(ImmediateGenerator):
        async def stream(self, messages, attempt=None):
            yield GenerationDelta(content="근거 답변 [S1]", finish_reason="stop")

    class Remote:
        attempted = False

        async def load_routing(self, call_log, timeout):
            return ("local", "gemini"), {"gemini": "key"}

        async def generate(self, provider, messages, api_key, call_log, budget):
            assert provider == "gemini"
            self.attempted = True
            return GenerationDelta(content="remote won", finish_reason="stop")

    gate = GenerationGate()
    if local_busy:
        await gate.acquire()
    remote = Remote()
    service = ChatService(settings, FakeEmbedding(), Retriever(), Local(), gate, remote)
    frames = b"".join([frame async for frame in service.stream(request(), uuid4())]).decode()
    assert remote.attempted is local_busy
    assert ("remote won" if local_busy else "근거 답변 [S1]") in frames
    assert (await gate.snapshot()).waiting == 0
    if local_busy:
        await gate.release()


async def test_slow_nonfinal_local_keeps_time_for_remote_and_discards_its_partial_output(settings):
    class SlowLocal(ImmediateGenerator):
        async def stream(self, messages, attempt=None):
            yield GenerationDelta(content="discarded local token")
            await asyncio.sleep(10)

    class Remote:
        async def load_routing(self, call_log, timeout):
            return ("local", "gemini"), {"gemini": "key"}

        async def generate(self, provider, messages, api_key, call_log, budget):
            assert budget > 0
            return GenerationDelta(content="remote won", finish_reason="stop")

    settings = settings.model_copy(
        update={"chat_first_token_timeout_ms": 900, "chat_total_timeout_ms": 1000}
    )
    gate = GenerationGate()
    service = ChatService(settings, FakeEmbedding(), Retriever(), SlowLocal(), gate, Remote())
    frames = b"".join([frame async for frame in service.stream(request(), uuid4())])
    assert b"remote won" in frames
    assert b"discarded local token" not in frames
    assert b"event: done" in frames
    assert (await gate.snapshot()).running == 0
