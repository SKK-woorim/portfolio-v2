from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from time import monotonic
from uuid import UUID

import httpx

from app.config import Settings
from app.supabase_auth import service_api_headers

logger = logging.getLogger(__name__)
_WRITE_TIMEOUT = 2
_MAX_PENDING = 64


def _token_count(usage: dict, key: str) -> int | None:
    value = usage.get(key)
    return value if type(value) is int and 0 <= value <= 2_147_483_647 else None


@dataclass
class ProviderAttempt:
    provider: str
    model: str | None
    started_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    started: float = field(default_factory=monotonic)
    http_status: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    finished: bool = False

    def usage(self, value: object, input_key: str, output_key: str, total_key: str) -> None:
        if isinstance(value, dict):
            self.input_tokens = _token_count(value, input_key)
            self.output_tokens = _token_count(value, output_key)
            self.total_tokens = _token_count(value, total_key)

    def response(self, response: httpx.Response) -> None:
        self.http_status = response.status_code
        response.raise_for_status()


class RequestCallLog:
    def __init__(self, request_id: UUID, sink: ProviderLogSink | None) -> None:
        self.request_id = request_id
        self._sink = sink
        self._attempts: list[dict] = []
        self.remote_budget_expired = False
        self.key_lookup_status: str | None = None

    def finish(
        self,
        attempt: ProviderAttempt,
        status: str = "success",
        error_class: str | None = None,
    ) -> None:
        attempt.finished = True
        self._attempts.append(
            {
                "provider": attempt.provider,
                "model": (
                    attempt.model
                    if attempt.model
                    and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,127}", attempt.model)
                    else None
                ),
                "started_at": attempt.started_at,
                "duration_ms": round((monotonic() - attempt.started) * 1000),
                "status": status,
                "http_status": attempt.http_status,
                "error_class": error_class,
                "input_tokens": attempt.input_tokens,
                "output_tokens": attempt.output_tokens,
                "total_tokens": attempt.total_tokens,
            }
        )

    def failure(self, attempt: ProviderAttempt, exc: BaseException) -> None:
        if isinstance(exc, asyncio.CancelledError):
            if attempt.provider != "local" and self.remote_budget_expired:
                self.finish(attempt, "timeout", "RemoteBudgetTimeout")
            else:
                self.finish(attempt, "cancelled", "CancelledError")
        elif isinstance(exc, (TimeoutError, httpx.TimeoutException)):
            self.finish(attempt, "timeout", "TimeoutError")
        else:
            error_class = "UnexpectedError"
            for error_type in (
                httpx.HTTPStatusError,
                httpx.RequestError,
                OSError,
                ValueError,
                TypeError,
                AttributeError,
                KeyError,
                RuntimeError,
            ):
                if isinstance(exc, error_type):
                    error_class = error_type.__name__
                    break
            self.finish(attempt, "error", error_class)

    def submit(self) -> None:
        if self._sink is not None and (self._attempts or self.key_lookup_status):
            self._sink.submit(self.request_id, self._attempts, self.key_lookup_status)
            self._attempts = []
            self.key_lookup_status = None


class ProviderLogSink:
    """Buffer completed calls without waiting on storage in the answer path."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._url = f"{settings.supabase_url}/rest/v1/rpc/record_chatbot_call_log"
        self._headers = service_api_headers(
            settings.supabase_service_role_key.get_secret_value(), json_content=True
        )
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient()
        self._pending: asyncio.Queue[dict] = asyncio.Queue(maxsize=_MAX_PENDING)
        self._task: asyncio.Task[None] | None = None
        self._closed = False

    def submit(self, request_id: UUID, attempts: list[dict], key_lookup_status: str | None) -> None:
        if self._closed:
            return
        try:
            self._pending.put_nowait(
                {
                    "p_request_id": str(request_id),
                    "p_attempts": attempts,
                    "p_key_lookup_status": key_lookup_status,
                }
            )
        except asyncio.QueueFull:
            logger.warning("provider call log dropped because the queue is full")
            return
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._drain())

    async def _drain(self) -> None:
        while not self._pending.empty():
            payload = self._pending.get_nowait()
            try:
                async with asyncio.timeout(_WRITE_TIMEOUT):
                    response = await self._client.post(
                        self._url, headers=self._headers, json=payload
                    )
                    response.raise_for_status()
            except Exception as exc:  # noqa: BLE001 - best-effort logging may never affect chat
                logger.warning("provider call log write failed error_type=%s", type(exc).__name__)
            finally:
                self._pending.task_done()

    async def close(self) -> None:
        self._closed = True
        if self._task is not None:
            try:
                async with asyncio.timeout(_WRITE_TIMEOUT):
                    await self._task
            except TimeoutError:
                logger.warning("provider call log shutdown exceeded its time budget")
        if self._owns_client:
            await self._client.aclose()
