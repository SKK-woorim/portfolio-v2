from __future__ import annotations

import json
import time
from uuid import uuid4

from conftest import FakeEmbedding
from fastapi.testclient import TestClient

from app.main import Components, create_app
from app.queue import GenerationGate
from app.retrieval import RetrievalResult
from app.security import HmacVerifier, ReplayCache, create_signature
from app.service import ChatService


class EmptyRetriever:
    async def search(self, query, query_embedding):
        return RetrievalResult(())

    async def close(self):
        return None


class UnusedGenerator:
    async def stream(self, messages):
        if False:
            yield None

    async def close(self):
        return None


def test_api_checks_body_hmac_replay_and_stream_contract(settings) -> None:
    embedding = FakeEmbedding()
    service = ChatService(
        settings,
        embedding,
        EmptyRetriever(),
        UnusedGenerator(),
        GenerationGate(5),
    )
    verifier = HmacVerifier(
        settings.chat_backend_secret.get_secret_value(),
        ReplayCache(),
        60,
    )
    components = Components(settings, service, verifier, embedding)
    app = create_app(settings, components)
    body = json.dumps(
        {"sessionId": str(uuid4()), "message": "없는 질문", "history": []},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    timestamp = str(int(time.time()))
    request_id = str(uuid4())
    signature = create_signature(
        settings.chat_backend_secret.get_secret_value(), timestamp, request_id, body
    )
    headers = {
        "content-type": "application/json",
        "accept": "text/event-stream",
        "x-chat-timestamp": timestamp,
        "x-chat-request-id": request_id,
        "x-chat-signature": signature,
    }
    with TestClient(app) as client:
        response = client.post("/v1/chat", content=body, headers=headers)
        assert response.status_code == 200
        assert "event: status" in response.text
        assert "event: sources" in response.text
        assert "event: error" in response.text
        assert '"code":"NO_RELEVANT_CONTEXT"' in response.text
        assert "event: token" not in response.text
        assert "event: done" not in response.text

        replay = client.post("/v1/chat", content=body, headers=headers)
        assert replay.status_code == 401

        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["generation"] == {"running": 0, "waiting": 0, "maxWaiters": 5}


def test_body_limit_rejects_before_authentication(settings) -> None:
    embedding = FakeEmbedding()
    service = ChatService(
        settings, embedding, EmptyRetriever(), UnusedGenerator(), GenerationGate()
    )
    components = Components(
        settings,
        service,
        HmacVerifier(settings.chat_backend_secret.get_secret_value(), ReplayCache()),
        embedding,
    )
    with TestClient(create_app(settings, components)) as client:
        response = client.post(
            "/v1/chat",
            content=b"x" * (16 * 1024 + 1),
            headers={"content-type": "application/json"},
        )
        assert response.status_code == 413


def test_invalid_contract_returns_400_not_422(settings) -> None:
    embedding = FakeEmbedding()
    service = ChatService(
        settings, embedding, EmptyRetriever(), UnusedGenerator(), GenerationGate()
    )
    components = Components(
        settings,
        service,
        HmacVerifier(settings.chat_backend_secret.get_secret_value(), ReplayCache()),
        embedding,
    )
    body = b'{"sessionId":"bad","message":""}'
    timestamp = str(int(time.time()))
    request_id = str(uuid4())
    headers = {
        "content-type": "application/json",
        "x-chat-timestamp": timestamp,
        "x-chat-request-id": request_id,
        "x-chat-signature": create_signature(
            settings.chat_backend_secret.get_secret_value(), timestamp, request_id, body
        ),
    }
    with TestClient(create_app(settings, components)) as client:
        response = client.post("/v1/chat", content=body, headers=headers)
        assert response.status_code == 400
