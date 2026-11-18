from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Any

import httpx

from app.provider_logging import ProviderAttempt


@dataclass(frozen=True)
class GenerationDelta:
    content: str = ""
    finish_reason: str | None = None


def parse_llama_sse_data(
    data: str, attempt: ProviderAttempt | None = None
) -> GenerationDelta | None:
    clean = data.strip()
    if not clean or clean == "[DONE]":
        return None
    payload: dict[str, Any] = json.loads(clean)
    if attempt is not None:
        attempt.usage(payload.get("usage"), "prompt_tokens", "completion_tokens", "total_tokens")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    choice = choices[0]
    delta = choice.get("delta") or {}
    content = delta.get("content", "") if isinstance(delta, dict) else ""
    return GenerationDelta(
        content=str(content) if content else "",
        finish_reason=str(choice["finish_reason"]) if choice.get("finish_reason") else None,
    )


class LlamaCppClient:
    def __init__(
        self,
        base_url: str,
        model_id: str,
        *,
        max_tokens: int = 320,
        temperature: float = 0.2,
        top_p: float = 0.9,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_id = model_id
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.top_p = top_p
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=None)

    async def stream(
        self, messages: Sequence[dict[str, str]], attempt: ProviderAttempt | None = None
    ) -> AsyncIterator[GenerationDelta]:
        async with self._client.stream(
            "POST",
            f"{self.base_url}/v1/chat/completions",
            json={
                "model": self.model_id,
                "messages": list(messages),
                "stream": True,
                **({"stream_options": {"include_usage": True}} if attempt is not None else {}),
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "top_p": self.top_p,
            },
            headers={"accept": "text/event-stream"},
        ) as response:
            if attempt is not None:
                attempt.response(response)
            else:
                response.raise_for_status()
            lines = response.aiter_lines()
            async for line in lines:
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                delta = parse_llama_sse_data(raw, attempt)
                if delta is None:
                    continue
                if delta.finish_reason and attempt is not None:
                    if delta.content:
                        yield GenerationDelta(content=delta.content)
                    await self._read_final_usage(lines, attempt)
                    yield GenerationDelta(finish_reason=delta.finish_reason)
                    return
                yield delta

    async def _read_final_usage(self, lines: AsyncIterator[str], attempt: ProviderAttempt) -> None:
        # llama.cpp can send the usage counters in an empty-choices chunk after finish_reason.
        if attempt.total_tokens is not None:
            return
        try:
            async with asyncio.timeout(0.1):
                async for line in lines:
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        return
                    parse_llama_sse_data(raw, attempt)
                    if attempt.total_tokens is not None:
                        return
        except (TimeoutError, httpx.HTTPError, OSError, ValueError, TypeError, AttributeError):
            # The answer is already complete even if its optional usage trailer is lost.
            return

    async def healthy(self) -> bool:
        try:
            response = await self._client.get(f"{self.base_url}/health", timeout=2.0)
            return response.is_success
        except httpx.HTTPError:
            return False

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
