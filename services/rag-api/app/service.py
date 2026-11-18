from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import aclosing
from time import monotonic
from typing import Protocol, TypeVar
from uuid import UUID

from anyio import CancelScope

from app.config import Settings
from app.contracts import ChatRequest, ErrorPayload
from app.embeddings import EmbeddingProvider
from app.generation import GenerationDelta
from app.prompting import build_messages
from app.provider_logging import ProviderAttempt, ProviderLogSink, RequestCallLog
from app.queue import GenerationGate, ModelBusyError
from app.remote_generation import Provider, RemoteGeneration, RemoteProvider
from app.retrieval import RetrievalResult, build_search_query
from app.sse import event, heartbeat

logger = logging.getLogger(__name__)
_T = TypeVar("_T")

NO_CONTEXT_MESSAGE = (
    "현재 공개된 포트폴리오와 블로그에서는 해당 내용을 확인할 수 없어요. "
    "다른 기술이나 프로젝트에 대해 질문하거나 연락처 페이지를 이용해 주세요."
)


class Retriever(Protocol):
    async def search(self, query: str, query_embedding: Sequence[float]) -> RetrievalResult: ...

    async def close(self) -> None: ...


class Generator(Protocol):
    def stream(
        self, messages: Sequence[dict[str, str]], attempt: ProviderAttempt
    ) -> AsyncIterator[GenerationDelta]: ...

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


class LocalGenerationError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


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
        remote: RemoteGeneration | None = None,
        provider_logs: ProviderLogSink | None = None,
    ) -> None:
        self.settings = settings
        self.embeddings = embeddings
        self.retriever = retriever
        self.generator = generator
        self.gate = gate
        self.remote = remote
        self.provider_logs = provider_logs

    async def stream(self, request: ChatRequest, request_id: UUID) -> AsyncIterator[bytes]:
        call_log = RequestCallLog(request_id, self.provider_logs)
        try:
            async with aclosing(self._stream(request, call_log)) as frames:
                async for frame in frames:
                    yield frame
        finally:
            call_log.submit()

    async def _stream(self, request: ChatRequest, call_log: RequestCallLog) -> AsyncIterator[bytes]:
        request_id = call_log.request_id
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
        except (asyncio.CancelledError, GeneratorExit):
            search_task.cancel()
            with CancelScope(shield=True):
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
        order: tuple[Provider, ...] = ("local",)
        keys: dict[RemoteProvider, str] = {}
        remaining = total_deadline - monotonic()
        if self.remote is not None and remaining > 0:
            # Keep at least half of a short remaining request budget for generation.
            routing = asyncio.create_task(self.remote.load_routing(call_log, remaining / 2))
            async with aclosing(self._wait_for_task(routing)) as frames:
                async for frame in frames:
                    yield frame
            order, keys = routing.result()

        last_error = "MODEL_UNAVAILABLE"
        for index, provider in enumerate(order):
            remaining = total_deadline - monotonic()
            if remaining <= 0:
                last_error = "GENERATION_TIMEOUT"
                break
            later = order[index + 1 :]
            budget = self._attempt_budget(provider, later, remaining)

            if provider == "local":
                buffered: list[str] = []
                finish_reason = "stop"
                try:
                    async with aclosing(
                        self._stream_local(
                            messages, call_log, total_deadline - (remaining - budget), bool(later)
                        )
                    ) as deltas:
                        async for delta in deltas:
                            if delta is None:
                                yield heartbeat()
                                continue
                            if delta.content:
                                if later:
                                    buffered.append(delta.content)
                                else:
                                    yield event("token", {"delta": delta.content})
                            if delta.finish_reason:
                                finish_reason = delta.finish_reason
                except LocalGenerationError as exc:
                    last_error = exc.code
                    continue
                call_log.submit()
                for content in buffered:
                    yield event("token", {"delta": content})
                yield event("done", {"requestId": str(request_id), "finishReason": finish_reason})
                return

            assert self.remote is not None
            task = asyncio.create_task(
                self.remote.generate(provider, messages, keys[provider], call_log, budget)
            )
            async with aclosing(self._wait_for_task(task)) as frames:
                async for frame in frames:
                    yield frame
            if (answer := task.result()) is not None:
                call_log.submit()
                for offset in range(0, len(answer.content), 1_000):
                    yield event("token", {"delta": answer.content[offset : offset + 1_000]})
                yield event(
                    "done",
                    {"requestId": str(request_id), "finishReason": answer.finish_reason},
                )
                return

        call_log.submit()
        yield error_event(last_error)

    def _attempt_budget(
        self, provider: Provider, later: tuple[Provider, ...], remaining: float
    ) -> float:
        remote_timeout = self.settings.chat_provider_timeout_ms / 1000
        local_reserve = self.settings.chat_first_token_timeout_ms / 1000
        reserve = sum(local_reserve if item == "local" else remote_timeout for item in later)
        # Normally reserve the full timeouts. For a short deadline each provider still
        # receives a share instead of losing its turn entirely.
        max_reserve = (
            remaining * len(later) / (len(later) + 1) if provider == "local" else remaining * 0.9
        )
        return remaining - min(reserve, max_reserve)

    async def _wait_for_task(self, task: asyncio.Task[_T]) -> AsyncIterator[bytes]:
        try:
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=self.settings.chat_heartbeat_seconds)
                if not done:
                    yield heartbeat()
        finally:
            if not task.done():
                task.cancel()
                with CancelScope(shield=True):
                    await asyncio.gather(task, return_exceptions=True)

    async def _stream_local(
        self,
        messages: Sequence[dict[str, str]],
        call_log: RequestCallLog,
        deadline: float,
        can_fallback: bool,
    ) -> AsyncIterator[GenerationDelta | None]:
        async def acquire() -> None:
            async with asyncio.timeout(max(0, deadline - monotonic())):
                await self.gate.acquire(wait=not can_fallback)

        acquire_task = asyncio.create_task(acquire())
        try:
            async with aclosing(self._wait_for_task(acquire_task)) as frames:
                async for _ in frames:
                    yield None
            acquire_task.result()
            async with aclosing(
                self._stream_generation(messages, call_log, deadline, can_fallback)
            ) as deltas:
                async for delta in deltas:
                    yield delta
        except ModelBusyError as exc:
            raise LocalGenerationError("MODEL_BUSY") from exc
        except TimeoutError as exc:
            raise LocalGenerationError("GENERATION_TIMEOUT") from exc
        finally:
            if (
                acquire_task.done()
                and not acquire_task.cancelled()
                and acquire_task.exception() is None
            ):
                with CancelScope(shield=True):
                    await self.gate.release()

    async def _search(self, query: str) -> RetrievalResult:
        vector = await self.embeddings.embed_query(query)
        return await self.retriever.search(query, vector)

    async def _stream_generation(
        self,
        messages: Sequence[dict[str, str]],
        call_log: RequestCallLog,
        deadline: float,
        require_finish: bool,
    ) -> AsyncIterator[GenerationDelta | None]:
        started = monotonic()
        if started >= deadline:
            raise LocalGenerationError("GENERATION_TIMEOUT")

        attempt = ProviderAttempt("local", self.settings.llama_model_id)
        iterator: AsyncIterator[GenerationDelta] | None = None
        pending: asyncio.Task[GenerationDelta] | None = None
        first_token_deadline = min(
            deadline,
            started + self.settings.chat_first_token_timeout_ms / 1000,
        )
        saw_token = False
        saw_nonblank = False
        finish_reason = None
        try:
            iterator = self.generator.stream(messages, attempt).__aiter__()
            pending = asyncio.create_task(iterator.__anext__())
            while True:
                remaining = (deadline if saw_token else first_token_deadline) - monotonic()
                if remaining <= 0:
                    code = "GENERATION_TIMEOUT" if saw_token else "FIRST_TOKEN_TIMEOUT"
                    error_class = "GenerationTimeout" if saw_token else "FirstTokenTimeout"
                    call_log.finish(attempt, "timeout", error_class)
                    raise LocalGenerationError(code)
                done, _ = await asyncio.wait(
                    {pending},
                    timeout=min(self.settings.chat_heartbeat_seconds, remaining),
                )
                if not done:
                    if monotonic() < (deadline if saw_token else first_token_deadline):
                        yield None
                    continue
                try:
                    delta = pending.result()
                except StopAsyncIteration:
                    break
                if delta.content:
                    saw_token = True
                    saw_nonblank = saw_nonblank or bool(delta.content.strip())
                    yield GenerationDelta(content=delta.content)
                if delta.finish_reason:
                    if delta.finish_reason in {"stop", "length", "cancelled"}:
                        finish_reason = delta.finish_reason
                    break
                pending = asyncio.create_task(iterator.__anext__())

            if finish_reason == "cancelled":
                call_log.finish(attempt, "cancelled", "CancelledError")
                if require_finish or not saw_token:
                    raise LocalGenerationError("MODEL_UNAVAILABLE")
            elif not saw_token or (require_finish and not saw_nonblank):
                call_log.finish(attempt, "error", "EmptyResponse")
                raise LocalGenerationError("MODEL_UNAVAILABLE")
            elif require_finish and finish_reason is None:
                call_log.finish(attempt, "error", "IncompleteResponse")
                raise LocalGenerationError("MODEL_UNAVAILABLE")
            else:
                call_log.finish(attempt)
            yield GenerationDelta(finish_reason=finish_reason or "stop")
        except LocalGenerationError:
            raise
        except (asyncio.CancelledError, GeneratorExit):
            if not attempt.finished:
                call_log.finish(attempt, "cancelled", "CancelledError")
            raise
        except Exception as exc:
            call_log.failure(attempt, exc)
            logger.warning(
                "generation failed request_id=%s error_type=%s",
                call_log.request_id,
                type(exc).__name__,
            )
            raise LocalGenerationError("MODEL_UNAVAILABLE") from exc
        finally:
            with CancelScope(shield=True):
                if pending is not None:
                    if not pending.done():
                        pending.cancel()
                    await asyncio.gather(pending, return_exceptions=True)
                aclose = getattr(iterator, "aclose", None)
                if aclose is not None:
                    try:
                        await aclose()
                    except Exception as exc:  # noqa: BLE001 - preserve the recorded attempt result
                        logger.warning(
                            "local stream close failed error_type=%s", type(exc).__name__
                        )

    async def close(self) -> None:
        if self.provider_logs is not None:
            await self.provider_logs.close()
        if self.remote is not None:
            await self.remote.close()
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

    async def has_remote_provider(self) -> bool:
        return self.remote is not None and await self.remote.has_configured_provider()
