from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class GenerationDelta:
    content: str = ""
    finish_reason: str | None = None


def parse_llama_sse_data(data: str) -> GenerationDelta | None:
    clean = data.strip()
    if not clean or clean == "[DONE]":
        return None
    payload: dict[str, Any] = json.loads(clean)
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

    async def stream(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[GenerationDelta]:
        async with self._client.stream(
            "POST",
            f"{self.base_url}/v1/chat/completions",
            json={
                "model": self.model_id,
                "messages": list(messages),
                "stream": True,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "top_p": self.top_p,
            },
            headers={"accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                delta = parse_llama_sse_data(raw)
                if delta is not None:
                    yield delta

    async def healthy(self) -> bool:
        try:
            response = await self._client.get(f"{self.base_url}/health", timeout=2.0)
            return response.is_success
        except httpx.HTTPError:
            return False

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
