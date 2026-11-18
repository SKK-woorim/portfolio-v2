from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from typing import Any, Literal

import httpx

from app.config import Settings
from app.generation import GenerationDelta
from app.provider_logging import ProviderAttempt, RequestCallLog
from app.supabase_auth import service_api_headers

logger = logging.getLogger(__name__)
Provider = Literal["openai", "gemini"]
PROVIDERS: tuple[Provider, ...] = ("openai", "gemini")


class RemoteGeneration:
    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=None)
        self._supabase_headers = service_api_headers(
            settings.supabase_service_role_key.get_secret_value(), json_content=True
        )

    async def _provider_rows(self, *, include_values: bool) -> list[dict[str, Any]] | None:
        try:
            async with asyncio.timeout(2):
                response = await self._client.post(
                    f"{self._settings.supabase_url}/rest/v1/rpc/get_ai_provider_keys",
                    headers=self._supabase_headers,
                    json={"p_include_values": include_values},
                )
                response.raise_for_status()
                rows = response.json()
                if not isinstance(rows, list) or any(
                    not isinstance(row, dict)
                    or row.get("provider") not in PROVIDERS
                    or (include_values and not isinstance(row.get("api_key"), str))
                    for row in rows
                ):
                    raise TypeError("unexpected provider key response")
                return rows
        except Exception as exc:  # noqa: BLE001 - fall back when the dependency fails
            logger.warning("provider key lookup failed error_type=%s", type(exc).__name__)
            return None

    async def has_configured_provider(self) -> bool:
        return bool(await self._provider_rows(include_values=False))

    async def generate(
        self, messages: Sequence[dict[str, str]], call_log: RequestCallLog | None = None
    ) -> GenerationDelta | None:
        try:
            rows = await self._provider_rows(include_values=True)
        except asyncio.CancelledError:
            if call_log is not None and call_log.remote_budget_expired:
                call_log.key_lookup_status = "failed"
            raise
        if rows is None:
            if call_log is not None:
                call_log.key_lookup_status = "failed"
            return None

        keys = {
            row["provider"]: row["api_key"].strip()
            for row in rows
            if isinstance(row.get("api_key"), str) and row["api_key"].strip()
        }
        if call_log is not None:
            missing = [provider for provider in PROVIDERS if provider not in keys]
            if len(missing) == 2:
                call_log.key_lookup_status = "missing_both"
            elif missing:
                call_log.key_lookup_status = f"missing_{missing[0]}"

        for provider in PROVIDERS:
            if not (api_key := keys.get(provider)):
                continue
            model = (
                self._settings.openai_model_id
                if provider == "openai"
                else self._settings.gemini_model_id
            )
            attempt = ProviderAttempt(provider, model)
            try:
                async with asyncio.timeout(self._settings.chat_provider_timeout_ms / 1000):
                    result = (
                        await self._openai(messages, api_key, attempt)
                        if provider == "openai"
                        else await self._gemini(messages, api_key, attempt)
                    )
                if result is not None and result.content.strip():
                    if call_log is not None:
                        call_log.finish(attempt)
                    return result
                if call_log is not None:
                    error_class = "IncompleteResponse" if result is None else "EmptyResponse"
                    call_log.finish(attempt, "error", error_class)
            except asyncio.CancelledError as exc:
                if call_log is not None:
                    call_log.failure(attempt, exc)
                raise
            except Exception as exc:  # noqa: BLE001 - fall back when the dependency fails
                if call_log is not None:
                    call_log.failure(attempt, exc)
                logger.warning(
                    "remote generation failed provider=%s error_type=%s",
                    provider,
                    type(exc).__name__,
                )
        return None

    async def _openai(
        self, messages: Sequence[dict[str, str]], api_key: str, attempt: ProviderAttempt
    ) -> GenerationDelta | None:
        response = await self._client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": self._settings.openai_model_id,
                "input": [item for item in messages if item["content"]],
                "max_output_tokens": max(16, self._settings.chat_max_output_tokens),
                "reasoning": {"effort": "none"},
                "store": False,
            },
        )
        attempt.response(response)
        data = response.json()
        attempt.usage(data.get("usage"), "input_tokens", "output_tokens", "total_tokens")
        if data.get("status") != "completed":
            return None
        content = "".join(
            part["text"]
            for item in data.get("output", [])
            if item.get("type") == "message"
            for part in item.get("content", [])
            if part.get("type") == "output_text" and isinstance(part.get("text"), str)
        )
        return GenerationDelta(content=content, finish_reason="stop")

    async def _gemini(
        self, messages: Sequence[dict[str, str]], api_key: str, attempt: ProviderAttempt
    ) -> GenerationDelta | None:
        model = self._settings.gemini_model_id
        response = await self._client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": api_key},
            json={
                "systemInstruction": {"parts": [{"text": messages[0]["content"]}]},
                "contents": [
                    {
                        "role": "model" if item["role"] == "assistant" else "user",
                        "parts": [{"text": item["content"]}],
                    }
                    for item in messages[1:]
                    if item["content"]
                ],
                "generationConfig": {
                    "maxOutputTokens": self._settings.chat_max_output_tokens + 1024,
                    "thinkingConfig": {"thinkingLevel": "LOW"},
                },
            },
        )
        attempt.response(response)
        data = response.json()
        attempt.usage(
            data.get("usageMetadata"),
            "promptTokenCount",
            "candidatesTokenCount",
            "totalTokenCount",
        )
        for candidate in data.get("candidates", []):
            if candidate.get("finishReason") == "STOP":
                content = "".join(
                    part["text"]
                    for part in candidate.get("content", {}).get("parts", [])
                    if not part.get("thought") and isinstance(part.get("text"), str)
                )
                return GenerationDelta(content=content, finish_reason="stop")
        return None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
