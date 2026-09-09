from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from app.contracts import ErrorPayload, SourceItem


class SseProtocolError(ValueError):
    """Raised when a stream violates the documented RAG SSE contract."""


@dataclass(frozen=True)
class SseFrame:
    event: str
    data: str


@dataclass(frozen=True)
class ContractEvent:
    name: str
    payload: Any


class SseDecoder:
    """Incrementally decode SSE without assuming network chunk boundaries."""

    def __init__(self, *, max_line_bytes: int = 64 * 1024, max_frame_bytes: int = 256 * 1024):
        self.max_line_bytes = max_line_bytes
        self.max_frame_bytes = max_frame_bytes
        self._buffer = bytearray()
        self._event_name: str | None = None
        self._data: str | None = None
        self._frame_bytes = 0

    def feed(self, chunk: bytes) -> list[SseFrame]:
        if not isinstance(chunk, bytes):
            raise SseProtocolError("SSE chunks must be bytes")
        self._buffer.extend(chunk)
        if len(self._buffer) > self.max_line_bytes and b"\n" not in self._buffer:
            raise SseProtocolError("SSE line exceeds the size limit")

        frames: list[SseFrame] = []
        while True:
            newline = self._buffer.find(b"\n")
            if newline < 0:
                break
            raw_line = bytes(self._buffer[:newline])
            del self._buffer[: newline + 1]
            if raw_line.endswith(b"\r"):
                raw_line = raw_line[:-1]
            if len(raw_line) > self.max_line_bytes:
                raise SseProtocolError("SSE line exceeds the size limit")
            try:
                line = raw_line.decode("utf-8", errors="strict")
            except UnicodeDecodeError as exc:
                raise SseProtocolError("SSE is not valid UTF-8") from exc
            dispatched = self._consume_line(line)
            if dispatched is not None:
                frames.append(dispatched)
        return frames

    def _consume_line(self, line: str) -> SseFrame | None:
        if not line:
            if self._event_name is None and self._data is None:
                self._frame_bytes = 0
                return None
            if self._event_name is None or self._data is None:
                raise SseProtocolError("SSE frame requires event and data fields")
            frame = SseFrame(self._event_name, self._data)
            self._event_name = None
            self._data = None
            self._frame_bytes = 0
            return frame

        self._frame_bytes += len(line.encode("utf-8"))
        if self._frame_bytes > self.max_frame_bytes:
            raise SseProtocolError("SSE frame exceeds the size limit")
        if line.startswith(":"):
            return None

        field, separator, value = line.partition(":")
        if separator and value.startswith(" "):
            value = value[1:]
        if field == "event":
            if self._event_name is not None:
                raise SseProtocolError("SSE frame contains duplicate event fields")
            self._event_name = value
        elif field == "data":
            if self._data is not None:
                raise SseProtocolError("multi-line SSE data is outside the API contract")
            self._data = value
        else:
            raise SseProtocolError(f"unsupported SSE field: {field or '<empty>'}")
        return None

    def finalize(self) -> None:
        if self._buffer or self._event_name is not None or self._data is not None:
            raise SseProtocolError("SSE stream ended with an incomplete frame")


def parse_contract_event(frame: SseFrame) -> ContractEvent:
    try:
        payload = json.loads(frame.data)
    except json.JSONDecodeError as exc:
        raise SseProtocolError("SSE data is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise SseProtocolError("SSE data must be a JSON object")

    try:
        if frame.event == "status":
            if set(payload) != {"phase", "message"}:
                raise SseProtocolError("invalid status payload")
            if payload["phase"] not in {"accepted", "searching", "generating"}:
                raise SseProtocolError("invalid status phase")
            if not isinstance(payload["message"], str):
                raise SseProtocolError("invalid status message")
            return ContractEvent(frame.event, payload)

        if frame.event == "sources":
            if set(payload) != {"items"} or not isinstance(payload["items"], list):
                raise SseProtocolError("invalid sources payload")
            items = [SourceItem.model_validate(item) for item in payload["items"]]
            if len(items) > 3:
                raise SseProtocolError("sources payload exceeds the three-item contract")
            return ContractEvent(frame.event, items)

        if frame.event == "token":
            if set(payload) != {"delta"} or not isinstance(payload["delta"], str):
                raise SseProtocolError("invalid token payload")
            return ContractEvent(frame.event, payload["delta"])

        if frame.event == "done":
            if set(payload) != {"requestId", "finishReason"}:
                raise SseProtocolError("invalid done payload")
            UUID(str(payload["requestId"]))
            if payload["finishReason"] not in {"stop", "length", "cancelled"}:
                raise SseProtocolError("invalid finish reason")
            return ContractEvent(frame.event, payload)

        if frame.event == "error":
            if set(payload) != {"code", "message"}:
                raise SseProtocolError("invalid error payload")
            return ContractEvent(frame.event, ErrorPayload.model_validate(payload))
    except (ValidationError, TypeError, ValueError) as exc:
        if isinstance(exc, SseProtocolError):
            raise
        raise SseProtocolError(f"invalid {frame.event} payload") from exc

    raise SseProtocolError(f"unsupported SSE event: {frame.event}")
