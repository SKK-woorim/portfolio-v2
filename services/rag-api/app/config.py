from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import BeforeValidator, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _empty_to_none(value: Any) -> Any:
    return None if value == "" else value


OptionalString = Annotated[str | None, BeforeValidator(_empty_to_none)]


class Settings(BaseSettings):
    """Validated process configuration.

    Required deployment values intentionally have no defaults. Constructing this
    class is part of startup, so a bad deployment never accepts traffic.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    supabase_url: str
    supabase_service_role_key: SecretStr
    chat_backend_secret: SecretStr

    llama_base_url: str = "http://127.0.0.1:8080"
    llama_model_id: str
    embedding_model_id: str
    embedding_dimension: int = Field(default=768, ge=1)

    rag_match_threshold: float = Field(ge=-1.0, le=1.0)
    rag_max_chunks: int = Field(default=5, ge=1, le=12)
    rag_candidate_chunks: int = Field(default=12, ge=1, le=50)
    rag_max_chunks_per_document: int = Field(default=2, ge=1, le=5)
    rag_max_context_tokens: int = Field(default=4000, ge=128, le=8000)

    chat_search_timeout_ms: int = Field(default=15_000, ge=100)
    chat_first_token_timeout_ms: int = Field(default=90_000, ge=100)
    chat_total_timeout_ms: int = Field(default=240_000, ge=1000)
    chat_heartbeat_seconds: float = Field(default=8.0, ge=1.0, le=10.0)
    chat_max_body_bytes: int = Field(default=16 * 1024, ge=1024, le=1024 * 1024)
    chat_timestamp_tolerance_seconds: int = Field(default=60, ge=1, le=300)
    chat_replay_ttl_seconds: int = Field(default=300, ge=60, le=3600)
    chat_queue_waiters: int = Field(default=5, ge=0, le=100)
    chat_max_output_tokens: int = Field(default=320, ge=1, le=2048)
    chat_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    chat_top_p: float = Field(default=0.9, gt=0.0, le=1.0)

    worker_id: OptionalString = None
    worker_poll_seconds: float = Field(default=2.0, ge=0.1, le=60.0)
    worker_claim_stale_seconds: int = Field(default=600, ge=30, le=86400)
    sentry_dsn: OptionalString = None
    log_level: str = "INFO"

    @field_validator("supabase_url", "llama_base_url")
    @classmethod
    def validate_absolute_http_url(cls, value: str) -> str:
        clean = value.rstrip("/")
        if not clean.startswith(("http://", "https://")):
            raise ValueError("must be an absolute http(s) URL")
        parsed = urlsplit(clean)
        if (
            any(char.isspace() for char in clean)
            or not parsed.hostname
            or "<" in clean
            or ">" in clean
        ):
            raise ValueError("must not contain whitespace")
        return clean

    @field_validator("supabase_service_role_key", "chat_backend_secret")
    @classmethod
    def validate_secret(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value().strip()
        lowered = raw.lower()
        placeholder_markers = ("changeme", "replace-me", "placeholder", "<required", "required-")
        if (
            not raw
            or any(marker in lowered for marker in placeholder_markers)
            or "<" in raw
            or ">" in raw
            or len(raw) < 16
        ):
            raise ValueError("must be a non-placeholder secret of at least 16 characters")
        return SecretStr(raw)

    @field_validator("llama_model_id", "embedding_model_id")
    @classmethod
    def validate_model_id(cls, value: str) -> str:
        clean = value.strip()
        lowered = clean.lower()
        if (
            not clean
            or "<" in clean
            or ">" in clean
            or "placeholder" in lowered
            or lowered == "latest"
            or lowered.endswith("/latest")
        ):
            raise ValueError("must be a pinned, non-placeholder model identifier")
        return clean

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        clean = value.upper()
        if clean not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("unsupported log level")
        return clean

    @model_validator(mode="after")
    def validate_timeouts(self) -> Settings:
        if self.chat_first_token_timeout_ms >= self.chat_total_timeout_ms:
            raise ValueError("first-token timeout must be shorter than total timeout")
        if self.chat_search_timeout_ms >= self.chat_total_timeout_ms:
            raise ValueError("search timeout must be shorter than total timeout")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
