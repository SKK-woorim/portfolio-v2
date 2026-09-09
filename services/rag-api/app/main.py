from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from uuid import UUID

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import Settings, get_settings
from app.contracts import ChatRequest
from app.embeddings import EmbeddingProvider, SentenceTransformerEmbedding
from app.generation import LlamaCppClient
from app.middleware import BodyLimitMiddleware
from app.queue import GenerationGate
from app.retrieval import SupabaseRetriever
from app.security import AuthenticationError, HmacVerifier, ReplayCache, SignedHeaders
from app.service import ChatService

logger = logging.getLogger(__name__)


@dataclass
class Components:
    settings: Settings
    service: ChatService
    verifier: HmacVerifier
    embeddings: EmbeddingProvider


async def build_components(settings: Settings) -> Components:
    embeddings = SentenceTransformerEmbedding(
        settings.embedding_model_id,
        dimension=settings.embedding_dimension,
    )
    await embeddings.load()
    service_key = settings.supabase_service_role_key.get_secret_value()
    retriever = SupabaseRetriever(
        settings.supabase_url,
        service_key,
        threshold=settings.rag_match_threshold,
        candidate_count=settings.rag_candidate_chunks,
        max_chunks=settings.rag_max_chunks,
        max_per_document=settings.rag_max_chunks_per_document,
        max_context_tokens=settings.rag_max_context_tokens,
    )
    generator = LlamaCppClient(
        settings.llama_base_url,
        settings.llama_model_id,
        max_tokens=settings.chat_max_output_tokens,
        temperature=settings.chat_temperature,
        top_p=settings.chat_top_p,
    )
    gate = GenerationGate(settings.chat_queue_waiters)
    service = ChatService(settings, embeddings, retriever, generator, gate)
    verifier = HmacVerifier(
        settings.chat_backend_secret.get_secret_value(),
        ReplayCache(ttl_seconds=settings.chat_replay_ttl_seconds),
        timestamp_tolerance_seconds=settings.chat_timestamp_tolerance_seconds,
    )
    return Components(settings, service, verifier, embeddings)


def create_app(
    settings: Settings | None = None,
    components: Components | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        resolved_settings = settings or get_settings()
        logging.basicConfig(
            level=resolved_settings.log_level,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
        if resolved_settings.sentry_dsn:
            try:
                import sentry_sdk
            except ImportError as exc:
                raise RuntimeError("SENTRY_DSN is set but sentry-sdk is not installed") from exc
            sentry_sdk.init(dsn=resolved_settings.sentry_dsn, send_default_pii=False)

        resolved = components or await build_components(resolved_settings)
        app.state.components = resolved
        app.state.ready = True
        try:
            yield
        finally:
            app.state.ready = False
            await resolved.service.close()

    api = FastAPI(
        title="Portfolio RAG API",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    # The public contract is fixed at 16 KiB. The setting may only make it stricter
    # when an app is constructed explicitly (for tests or an embedded deployment).
    max_body = min(16 * 1024, settings.chat_max_body_bytes) if settings else 16 * 1024
    api.add_middleware(BodyLimitMiddleware, max_bytes=max_body)

    @api.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "invalid request"},
            headers={"Cache-Control": "no-store"},
        )

    @api.exception_handler(AuthenticationError)
    async def authentication_error(_: Request, __: AuthenticationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "unauthorized"},
            headers={"Cache-Control": "no-store"},
        )

    async def authenticate(
        request: Request,
        x_chat_timestamp: str | None = Header(default=None, alias="X-Chat-Timestamp"),
        x_chat_request_id: str | None = Header(default=None, alias="X-Chat-Request-Id"),
        x_chat_signature: str | None = Header(default=None, alias="X-Chat-Signature"),
    ) -> UUID:
        if not x_chat_timestamp or not x_chat_request_id or not x_chat_signature:
            raise AuthenticationError("missing signed headers")
        components: Components = request.app.state.components
        raw_body = getattr(request.state, "raw_body", b"")
        return await components.verifier.verify(
            SignedHeaders(x_chat_timestamp, x_chat_request_id, x_chat_signature),
            raw_body,
        )

    @api.post("/v1/chat")
    async def chat(
        request: Request,
        payload: ChatRequest,
        request_id: UUID = Depends(authenticate),  # noqa: B008 - FastAPI dependency declaration
    ) -> StreamingResponse:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            raise HTTPException(status_code=415, detail="content-type must be application/json")
        resolved: Components = request.app.state.components
        return StreamingResponse(
            resolved.service.stream(payload, request_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @api.get("/health")
    async def health(request: Request) -> JSONResponse:
        resolved: Components = request.app.state.components
        snapshot = await resolved.service.gate.snapshot()
        model_ready = await resolved.service.model_healthy()
        ready = bool(request.app.state.ready and resolved.embeddings.ready and model_ready)
        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "status": "ok" if ready else "not_ready",
                "embeddingReady": resolved.embeddings.ready,
                "modelReady": model_ready,
                "generation": {
                    "running": snapshot.running,
                    "waiting": snapshot.waiting,
                    "maxWaiters": snapshot.max_waiters,
                },
            },
            headers={"Cache-Control": "no-store"},
        )

    return api


app = create_app()


def run() -> None:
    # One process is intentional: generation is single-flight and the replay cache
    # is process-local. Scale vertically or introduce shared coordination first.
    uvicorn.run("app.main:app", host="127.0.0.1", port=8090, workers=1, proxy_headers=True)


if __name__ == "__main__":
    run()
