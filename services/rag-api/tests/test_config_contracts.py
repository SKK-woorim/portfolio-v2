from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.contracts import ChatRequest


def test_settings_reject_placeholder_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="placeholder",
            chat_backend_secret="backend-hmac-secret-value",
            llama_model_id="pinned-model",
            embedding_model_id="pinned-embedding",
            rag_match_threshold=0.5,
        )


def test_settings_reject_unpinned_latest_model() -> None:
    with pytest.raises(ValidationError):
        Settings(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="service-role-secret-value",
            chat_backend_secret="backend-hmac-secret-value",
            llama_model_id="latest",
            embedding_model_id="pinned-embedding",
            rag_match_threshold=0.5,
        )


def test_settings_reject_angle_bracket_deployment_placeholders() -> None:
    with pytest.raises(ValidationError):
        Settings(
            supabase_url="https://<PROJECT-REF>.supabase.co",
            supabase_service_role_key="<REQUIRED-SERVICE-ROLE-SECRET>",
            chat_backend_secret="<REQUIRED-CHAT-SECRET>",
            llama_model_id="<PINNED-LLAMA-MODEL-ID>",
            embedding_model_id="/models/<PINNED-EMBEDDING-SNAPSHOT>",
            rag_match_threshold=0.5,
        )


def test_chat_request_trims_and_accepts_four_history_items() -> None:
    payload = ChatRequest.model_validate(
        {
            "sessionId": str(uuid4()),
            "message": " 질문 ",
            "history": [
                {"role": "user", "content": "a"},
                {"role": "assistant", "content": "b"},
                {"role": "user", "content": "c"},
                {"role": "assistant", "content": "d"},
            ],
        }
    )
    assert payload.message == "질문"
    assert len(payload.history) == 4


@pytest.mark.parametrize(
    "change",
    [
        {"message": " "},
        {"message": "x" * 501},
        {"history": [{"role": "system", "content": "bad"}]},
        {"history": [{"role": "user", "content": "x" * 1001}]},
        {"unknown": True},
    ],
)
def test_chat_request_rejects_invalid_contract(change: dict[str, object]) -> None:
    data: dict[str, object] = {"sessionId": str(uuid4()), "message": "ok", "history": []}
    data.update(change)
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(data)
