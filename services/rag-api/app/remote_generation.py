from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from time import monotonic
from typing import Any, Literal, cast

import httpx

from app.config import Settings
from app.generation import GenerationDelta
from app.provider_logging import ProviderAttempt, RequestCallLog
from app.supabase_auth import service_api_headers

logger = logging.getLogger(__name__)
RemoteProvider = Literal["openai", "gemini"]
Provider = Literal["openai", "gemini", "local"]
REMOTE_PROVIDERS: tuple[RemoteProvider, ...] = ("openai", "gemini")
DEFAULT_PROVIDER_ORDER: tuple[Provider, ...] = (*REMOTE_PROVIDERS, "local")
_LOOKUP_TIMEOUT = 2.0


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

    async def _provider_rows(
        self, *, include_values: bool, timeout: float = _LOOKUP_TIMEOUT
    ) -> list[dict[str, Any]] | None:
        try:
            async with asyncio.timeout(timeout):
                response = await self._client.post(
                    f"{self._settings.supabase_url}/rest/v1/rpc/get_ai_provider_keys",
                    headers=self._supabase_headers,
                    json={"p_include_values": include_values},
                )
                response.raise_for_status()
                return self._validate_rows(response.json(), include_values=include_values)
        except Exception as exc:  # noqa: BLE001 - fall back when the dependency fails
            logger.warning("provider key lookup failed error_type=%s", type(exc).__name__)
            return None

    async def has_configured_provider(self) -> bool:
        return bool(await self._provider_rows(include_values=False))

    @staticmethod
    def _validate_rows(value: object, *, include_values: bool) -> list[dict[str, Any]]:
        if not isinstance(value, list) or any(
            not isinstance(row, dict)
            or row.get("provider") not in REMOTE_PROVIDERS
            or (include_values and not isinstance(row.get("api_key"), str))
            for row in value
        ):
            raise TypeError("unexpected provider key response")
        return value

    async def _routing_configuration(
        self, timeout: float
    ) -> tuple[tuple[Provider, ...], list[dict[str, Any]] | None]:
        deadline = monotonic() + timeout
        try:
            async with asyncio.timeout(timeout / 2):
                response = await self._client.post(
                    f"{self._settings.supabase_url}/rest/v1/rpc/get_ai_provider_configuration",
                    headers=self._supabase_headers,
                    json={"p_include_values": True},
                )
                response.raise_for_status()
                payload = response.json()
                rows = self._validate_rows(payload["keys"], include_values=True)
                order = payload.get("provider_order")
                if (
                    isinstance(order, list)
                    and len(order) == len(DEFAULT_PROVIDER_ORDER)
                    and all(provider in order for provider in DEFAULT_PROVIDER_ORDER)
                ):
                    return tuple(cast(list[Provider], order)), rows
                logger.warning("invalid provider order; using default")
                return DEFAULT_PROVIDER_ORDER, rows
        except Exception as exc:  # noqa: BLE001 - read keys from the existing RPC during fallback
            logger.warning("provider configuration lookup failed error_type=%s", type(exc).__name__)
            remaining = deadline - monotonic()
            rows = (
                await self._provider_rows(include_values=True, timeout=remaining)
                if remaining > 0
                else None
            )
            return DEFAULT_PROVIDER_ORDER, rows

    async def load_routing(
        self, call_log: RequestCallLog, timeout: float
    ) -> tuple[tuple[Provider, ...], dict[RemoteProvider, str]]:
        order, rows = await self._routing_configuration(min(timeout, _LOOKUP_TIMEOUT))
        if rows is None:
            call_log.key_lookup_status = "failed"
            return ("local",), {}

        keys = {
            cast(RemoteProvider, row["provider"]): row["api_key"].strip()
            for row in rows
            if row["api_key"].strip()
        }
        missing = [provider for provider in REMOTE_PROVIDERS if provider not in keys]
        if len(missing) == 2:
            call_log.key_lookup_status = "missing_both"
        elif missing:
            call_log.key_lookup_status = f"missing_{missing[0]}"
        return tuple(
            provider for provider in order if provider == "local" or provider in keys
        ), keys

    async def generate(
        self,
        provider: RemoteProvider,
        messages: Sequence[dict[str, str]],
        api_key: str,
        call_log: RequestCallLog,
        budget: float,
    ) -> GenerationDelta | None:
        model = (
            self._settings.openai_model_id
            if provider == "openai"
            else self._settings.gemini_model_id
        )
        attempt = ProviderAttempt(provider, model)
        provider_timeout = self._settings.chat_provider_timeout_ms / 1000
        try:
            async with asyncio.timeout(min(budget, provider_timeout)):
                result = (
                    await self._openai(messages, api_key, attempt)
                    if provider == "openai"
                    else await self._gemini(messages, api_key, attempt)
                )
            if result is not None and result.content.strip():
                call_log.finish(attempt)
                return result
            error_class = "IncompleteResponse" if result is None else "EmptyResponse"
            call_log.finish(attempt, "error", error_class)
        except TimeoutError as exc:
            if budget < provider_timeout:
                call_log.finish(attempt, "timeout", "RemoteBudgetTimeout")
            else:
                call_log.failure(attempt, exc)
            logger.warning("remote generation timed out provider=%s", provider)
        except asyncio.CancelledError as exc:
            call_log.failure(attempt, exc)
            raise
        except Exception as exc:  # noqa: BLE001 - fall back when the dependency fails
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
