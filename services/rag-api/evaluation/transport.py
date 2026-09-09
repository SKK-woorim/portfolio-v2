from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from time import monotonic, time
from typing import Literal, Protocol
from urllib.parse import urlsplit
from uuid import UUID

import httpx

from app.contracts import ChatRequest
from app.security import create_signature


class TransportError(RuntimeError):
    """A deliberately sanitized transport failure."""


@dataclass(frozen=True)
class ReceivedChunk:
    data: bytes
    elapsed_ms: float


class EvaluationTransport(Protocol):
    def stream(
        self,
        request: ChatRequest,
        request_id: UUID,
    ) -> AsyncIterator[ReceivedChunk]: ...


def validate_endpoint(value: str) -> str:
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
        or any(char.isspace() for char in value)
    ):
        raise ValueError("endpoint must be an absolute HTTP(S) URL without credentials")
    return value


class HttpEvaluationTransport:
    def __init__(
        self,
        endpoint: str,
        *,
        auth_mode: Literal["hmac", "none"] = "hmac",
        secret: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.endpoint = validate_endpoint(endpoint)
        self.auth_mode = auth_mode
        if auth_mode == "hmac" and not secret:
            raise ValueError("HMAC mode requires a secret supplied through the environment")
        self._secret = secret
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=None, follow_redirects=False)

    async def stream(
        self,
        request: ChatRequest,
        request_id: UUID,
    ) -> AsyncIterator[ReceivedChunk]:
        body = json.dumps(
            request.model_dump(mode="json", by_alias=True),
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        headers = {"content-type": "application/json", "accept": "text/event-stream"}
        if self.auth_mode == "hmac":
            timestamp = str(int(time()))
            request_id_text = str(request_id)
            headers.update(
                {
                    "x-chat-timestamp": timestamp,
                    "x-chat-request-id": request_id_text,
                    "x-chat-signature": create_signature(
                        self._secret or "",
                        timestamp,
                        request_id_text,
                        body,
                    ),
                }
            )

        started = monotonic()
        try:
            async with self._client.stream(
                "POST",
                self.endpoint,
                content=body,
                headers=headers,
            ) as response:
                if response.status_code != 200:
                    raise TransportError(f"HTTP status {response.status_code}")
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
                if content_type.casefold() != "text/event-stream":
                    raise TransportError("response is not an SSE stream")
                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield ReceivedChunk(chunk, (monotonic() - started) * 1000)
        except TransportError:
            raise
        except (httpx.HTTPError, OSError) as exc:
            # Never include the response body, request body, URL query, or headers.
            raise TransportError(f"transport failed ({type(exc).__name__})") from exc

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
