from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import httpx
import pytest

from app.provider_logging import RequestCallLog
from app.remote_generation import RemoteGeneration

MESSAGES = [
    {"role": "system", "content": "공개 자료를 바탕으로 답합니다."},
    {"role": "user", "content": "질문과 공개 근거 [S1]"},
]
GPT_RESPONSE = {
    "status": "completed",
    "output": [{"type": "message", "content": [{"type": "output_text", "text": "GPT [S1]"}]}],
}
GEMINI_RESPONSE = {
    "candidates": [
        {
            "finishReason": "STOP",
            "content": {"parts": [{"text": "thought", "thought": True}, {"text": "Gemini [S1]"}]},
        }
    ],
}


@pytest.mark.parametrize(
    "keys, gpt_status, gpt_response, expected, hosts",
    [
        (
            ["openai", "gemini"],
            200,
            GPT_RESPONSE,
            "GPT [S1]",
            ["api.openai.com"],
        ),
        (
            ["openai", "gemini"],
            429,
            {"error": "private details"},
            "Gemini [S1]",
            ["api.openai.com", "aiplatform.googleapis.com"],
        ),
        (
            ["openai", "gemini"],
            200,
            {**GPT_RESPONSE, "status": "incomplete"},
            "Gemini [S1]",
            ["api.openai.com", "aiplatform.googleapis.com"],
        ),
        (
            ["gemini"],
            200,
            {},
            "Gemini [S1]",
            ["aiplatform.googleapis.com"],
        ),
        (["openai"], 401, {}, None, ["api.openai.com"]),
        ([], 200, {}, None, []),
    ],
)
async def test_provider_order_and_request_mapping(
    settings, caplog, keys, gpt_status, gpt_response, expected, hosts
):
    calls = []

    def handle(request):
        body = json.loads(request.content)
        if request.url.path.endswith("/get_ai_provider_keys"):
            assert body == {"p_include_values": True}
            return httpx.Response(
                200,
                json=[{"provider": provider, "api_key": f"secret-{provider}"} for provider in keys],
            )

        calls.append(request.url.host)
        assert "apikey" not in request.headers
        if request.url.host == "api.openai.com":
            assert request.headers["authorization"] == "Bearer secret-openai"
            assert body["model"] == "gpt-6-luna"
            assert body["input"] == MESSAGES
            assert body["store"] is False
            assert body["reasoning"] == {"effort": "none"}
            assert body["max_output_tokens"] == settings.chat_max_output_tokens
            return httpx.Response(gpt_status, json=gpt_response)

        assert request.headers["x-goog-api-key"] == "secret-gemini"
        assert "authorization" not in request.headers
        assert request.url.query == b""
        assert request.url.path == "/v1/publishers/google/models/gemini-3.8-flash:generateContent"
        assert body["systemInstruction"]["parts"] == [{"text": MESSAGES[0]["content"]}]
        assert body["contents"] == [{"role": "user", "parts": [{"text": MESSAGES[1]["content"]}]}]
        assert body["generationConfig"]["thinkingConfig"] == {"thinking_level": "LOW"}
        return httpx.Response(200, json=GEMINI_RESPONSE)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        answer = await RemoteGeneration(settings, client).generate(MESSAGES)
    assert (answer.content if answer else None) == expected
    assert calls == hosts
    assert "secret" not in caplog.text
    assert "private details" not in caplog.text


async def test_timeout_reaches_gemini(settings):
    async def handle(request):
        if request.url.path.endswith("/get_ai_provider_keys"):
            return httpx.Response(
                200,
                json=[
                    {"provider": "openai", "api_key": "openai-key"},
                    {"provider": "gemini", "api_key": "gemini-key"},
                ],
            )
        if request.url.host == "api.openai.com":
            await asyncio.sleep(2)
            return httpx.Response(200, json=GPT_RESPONSE)
        return httpx.Response(200, json=GEMINI_RESPONSE)

    settings = settings.model_copy(update={"chat_provider_timeout_ms": 100})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        answer = await RemoteGeneration(settings, client).generate(MESSAGES)
    assert answer and answer.content == "Gemini [S1]"


async def test_key_lookup_error_skips_remote_calls(settings):
    def handle(request):
        assert request.url.path.endswith("/get_ai_provider_keys")
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        assert await RemoteGeneration(settings, client).generate(MESSAGES) is None


async def test_health_uses_only_provider_metadata(settings):
    def handle(request):
        assert request.url.path.endswith("/get_ai_provider_keys")
        assert json.loads(request.content) == {"p_include_values": False}
        return httpx.Response(200, json=[{"provider": "openai"}])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        assert await RemoteGeneration(settings, client).has_configured_provider()


async def test_vertex_permission_error_retains_only_safe_metadata(settings, caplog):
    class LogSink:
        entry = None

        def submit(self, request_id, attempts, key_lookup_status):
            self.entry = attempts[0]

    def handle(request):
        if request.url.path.endswith("/get_ai_provider_keys"):
            return httpx.Response(200, json=[{"provider": "gemini", "api_key": "secret-key"}])
        assert request.url.host == "aiplatform.googleapis.com"
        return httpx.Response(
            403,
            json={
                "error": {"code": 403, "message": "private details", "status": "PERMISSION_DENIED"}
            },
        )

    sink = LogSink()
    call_log = RequestCallLog(uuid4(), sink)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        assert await RemoteGeneration(settings, client).generate(MESSAGES, call_log) is None
    call_log.submit()
    assert sink.entry["http_status"] == 403
    assert sink.entry["error_class"] == "HTTPStatusError"
    assert "secret-key" not in caplog.text
    assert "private details" not in caplog.text
