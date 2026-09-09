from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Sequence
from time import monotonic
from typing import Protocol
from uuid import UUID

import httpx

from app.config import Settings
from app.contracts import ChatRequest, ErrorPayload
from app.embeddings import EmbeddingProvider
from app.generation import GenerationDelta
from app.prompting import build_messages
from app.queue import GenerationGate, ModelBusyError
from app.retrieval import RetrievalResult, build_search_query
from app.sse import event, heartbeat

logger = logging.getLogger(__name__)

NO_CONTEXT_MESSAGE = (
    "현재 공개된 포트폴리오와 블로그에서는 해당 내용을 확인할 수 없어요. "
    "다른 기술이나 프로젝트에 대해 질문하거나 연락처 페이지를 이용해 주세요."
)


class Retriever(Protocol):
    async def search(self, query: str, query_embedding: Sequence[float]) -> RetrievalResult: ...

    async def close(self) -> None: ...


class Generator(Protocol):
    def stream(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[GenerationDelta]: ...

    async def close(self) -> None: ...


ERROR_MESSAGES = {
    "SEARCH_UNAVAILABLE": "관련 정보를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.",
    "NO_RELEVANT_CONTEXT": NO_CONTEXT_MESSAGE,
    "MODEL_BUSY": "요청이 많아요. 잠시 후 다시 질문해 주세요.",
    "MODEL_UNAVAILABLE": "챗봇 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    "FIRST_TOKEN_TIMEOUT": "답변 생성에 시간이 너무 오래 걸렸어요. 질문을 조금 짧게 바꿔 다시 시도해 주세요.",
    "GENERATION_TIMEOUT": "답변 생성에 시간이 너무 오래 걸렸어요. 질문을 조금 짧게 바꿔 다시 시도해 주세요.",
    "INTERNAL_ERROR": "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
}


def error_event(code: str) -> bytes:
    return event("error", ErrorPayload(code=code, message=ERROR_MESSAGES[code]))  # type: ignore[arg-type]


class ChatService:
    def __init__(
        self,
        settings: Settings,
        embeddings: EmbeddingProvider,
        retriever: Retriever,
        generator: Generator,
        gate: GenerationGate,
    ) -> None:
        self.settings = settings
        self.embeddings = embeddings
        self.retriever = retriever
        self.generator = generator
        self.gate = gate

    async def stream(self, request: ChatRequest, request_id: UUID) -> AsyncIterator[bytes]:
        started = monotonic()
        total_deadline = started + self.settings.chat_total_timeout_ms / 1000
        yield event("status", {"phase": "searching", "message": "관련 정보를 검색하고 있어요."})

        query = build_search_query(request.message, request.history)
        search_timeout = min(
            self.settings.chat_search_timeout_ms / 1000,
            max(0.001, total_deadline - monotonic()),
        )
        search_deadline = monotonic() + search_timeout
        search_task = asyncio.create_task(self._search(query))
        try:
            while not search_task.done():
                remaining = search_deadline - monotonic()
                if remaining <= 0:
                    search_task.cancel()
                    await asyncio.gather(search_task, return_exceptions=True)
                    raise TimeoutError("search timeout")
                done, _ = await asyncio.wait(
                    {search_task},
                    timeout=min(self.settings.chat_heartbeat_seconds, remaining),
                )
                if not done:
                    yield heartbeat()
            result = search_task.result()
        except asyncio.CancelledError:
            search_task.cancel()
            await asyncio.gather(search_task, return_exceptions=True)
            raise
        except Exception as exc:  # noqa: BLE001 - convert dependency failures to the SSE contract
            logger.warning(
                "search failed request_id=%s error_type=%s", request_id, type(exc).__name__
            )
            yield error_event("SEARCH_UNAVAILABLE")
            return

        sources = result.sources
        yield event("sources", {"items": [source.model_dump() for source in sources]})
        if not result.chunks:
            yield error_event("NO_RELEVANT_CONTEXT")
            return

        yield event("status", {"phase": "generating", "message": "답변을 생성하고 있어요."})
        messages = build_messages(request.message, request.history, result)
        acquired = False
        acquire_task = asyncio.create_task(self.gate.acquire())
        try:
            while not acquire_task.done():
                remaining = total_deadline - monotonic()
                if remaining <= 0:
                    acquire_task.cancel()
                    await asyncio.gather(acquire_task, return_exceptions=True)
                    yield error_event("GENERATION_TIMEOUT")
                    return
                done, _ = await asyncio.wait(
                    {acquire_task},
                    timeout=min(self.settings.chat_heartbeat_seconds, remaining),
                )
                if not done:
                    yield heartbeat()
            try:
                acquire_task.result()
                acquired = True
            except ModelBusyError:
                yield error_event("MODEL_BUSY")
                return

            async for frame in self._stream_generation(messages, request_id, total_deadline):
                yield frame
        except asyncio.CancelledError:
            if acquire_task.done() and not acquire_task.cancelled() and not acquired:
                try:
                    acquire_task.result()
                    acquired = True
                except ModelBusyError:
                    pass
            else:
                acquire_task.cancel()
                await asyncio.gather(acquire_task, return_exceptions=True)
            raise
        finally:
            if not acquire_task.done():
                acquire_task.cancel()
                await asyncio.gather(acquire_task, return_exceptions=True)
            if acquired:
                await self.gate.release()

    async def _search(self, query: str) -> RetrievalResult:
        vector = await self.embeddings.embed_query(query)
        return await self.retriever.search(query, vector)

    async def _stream_generation(
        self,
        messages: Sequence[dict[str, str]],
        request_id: UUID,
        total_deadline: float,
    ) -> AsyncIterator[bytes]:
        iterator = self.generator.stream(messages).__aiter__()
        pending = asyncio.create_task(iterator.__anext__())
        first_token_deadline = min(
            total_deadline,
            monotonic() + self.settings.chat_first_token_timeout_ms / 1000,
        )
        saw_token = False
        finish_reason = "stop"
        try:
            while True:
                now = monotonic()
                deadline = total_deadline if saw_token else first_token_deadline
                remaining = deadline - now
                if remaining <= 0:
                    pending.cancel()
                    await asyncio.gather(pending, return_exceptions=True)
                    yield error_event("GENERATION_TIMEOUT" if saw_token else "FIRST_TOKEN_TIMEOUT")
                    return
                done, _ = await asyncio.wait(
                    {pending},
                    timeout=min(self.settings.chat_heartbeat_seconds, remaining),
                )
                if not done:
                    yield heartbeat()
                    continue
                try:
                    delta = pending.result()
                except StopAsyncIteration:
                    break
                if delta.content:
                    saw_token = True
                    yield event("token", {"delta": delta.content})
                if delta.finish_reason:
                    finish_reason = (
                        delta.finish_reason
                        if delta.finish_reason in {"stop", "length", "cancelled"}
                        else "stop"
                    )
                    break
                pending = asyncio.create_task(iterator.__anext__())

            if not saw_token:
                yield error_event("MODEL_UNAVAILABLE")
                return
            yield event(
                "done",
                {"requestId": str(request_id), "finishReason": finish_reason},
            )
        except asyncio.CancelledError:
            pending.cancel()
            raise
        except (httpx.HTTPError, OSError, RuntimeError, ValueError) as exc:
            logger.warning(
                "generation failed request_id=%s error_type=%s",
                request_id,
                type(exc).__name__,
            )
            yield error_event("MODEL_UNAVAILABLE")
        finally:
            if not pending.done():
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)
            aclose = getattr(iterator, "aclose", None)
            if aclose is not None:
                await aclose()

    async def close(self) -> None:
        await self.generator.close()
        await self.retriever.close()
        await self.embeddings.close()

    async def model_healthy(self) -> bool:
        check = getattr(self.generator, "healthy", None)
        if check is None:
            return True
        try:
            return bool(await check())
        except Exception as exc:  # noqa: BLE001 - health checks must return not-ready, never 500
            logger.warning("model health check failed error_type=%s", type(exc).__name__)
            return False
