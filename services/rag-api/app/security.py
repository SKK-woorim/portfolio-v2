from __future__ import annotations

import asyncio
import hashlib
import hmac
import time
from collections import OrderedDict
from dataclasses import dataclass
from uuid import UUID


class AuthenticationError(ValueError):
    pass


class ReplayError(AuthenticationError):
    pass


@dataclass(frozen=True)
class SignedHeaders:
    timestamp: str
    request_id: str
    signature: str


def signature_payload(timestamp: str, request_id: str, raw_body: bytes) -> bytes:
    return timestamp.encode("ascii") + b"." + request_id.encode("ascii") + b"." + raw_body


def create_signature(secret: str | bytes, timestamp: str, request_id: str, raw_body: bytes) -> str:
    key = secret.encode("utf-8") if isinstance(secret, str) else secret
    return hmac.new(
        key, signature_payload(timestamp, request_id, raw_body), hashlib.sha256
    ).hexdigest()


class ReplayCache:
    """Bounded, process-local replay cache.

    A single Uvicorn worker is required in production. The cache is deliberately
    independent of user/session data and stores request IDs only.
    """

    def __init__(self, ttl_seconds: int = 300, max_entries: int = 10_000) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._entries: OrderedDict[str, float] = OrderedDict()
        self._lock = asyncio.Lock()

    async def register(self, request_id: str, now: float | None = None) -> bool:
        current = time.time() if now is None else now
        cutoff = current - self.ttl_seconds
        async with self._lock:
            while self._entries:
                _, seen_at = next(iter(self._entries.items()))
                if seen_at >= cutoff:
                    break
                self._entries.popitem(last=False)
            if request_id in self._entries:
                return False
            self._entries[request_id] = current
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)
            return True


class HmacVerifier:
    def __init__(
        self,
        secret: str,
        replay_cache: ReplayCache,
        timestamp_tolerance_seconds: int = 60,
    ) -> None:
        self._secret = secret
        self._replay_cache = replay_cache
        self._timestamp_tolerance_seconds = timestamp_tolerance_seconds

    async def verify(
        self,
        headers: SignedHeaders,
        raw_body: bytes,
        now: float | None = None,
    ) -> UUID:
        current = time.time() if now is None else now
        try:
            timestamp = int(headers.timestamp)
        except (TypeError, ValueError) as exc:
            raise AuthenticationError("invalid timestamp") from exc
        if abs(current - timestamp) > self._timestamp_tolerance_seconds:
            raise AuthenticationError("expired timestamp")
        try:
            request_uuid = UUID(headers.request_id)
        except (TypeError, ValueError) as exc:
            raise AuthenticationError("invalid request id") from exc

        provided = headers.signature.removeprefix("sha256=").lower()
        expected = create_signature(
            self._secret,
            headers.timestamp,
            headers.request_id,
            raw_body,
        )
        if len(provided) != len(expected) or not hmac.compare_digest(provided, expected):
            raise AuthenticationError("invalid signature")
        if not await self._replay_cache.register(str(request_uuid), current):
            raise ReplayError("request id has already been used")
        return request_uuid
