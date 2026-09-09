from __future__ import annotations

import asyncio
import logging
import os
import socket
from uuid import uuid4

from app.config import get_settings
from app.embeddings import SentenceTransformerEmbedding
from worker.repository import SupabaseSyncRepository
from worker.source_loader import SupabaseSourceLoader
from worker.sync import SyncWorker


async def async_main() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if settings.sentry_dsn:
        try:
            import sentry_sdk
        except ImportError as exc:
            raise RuntimeError("SENTRY_DSN is set but sentry-sdk is not installed") from exc
        sentry_sdk.init(dsn=settings.sentry_dsn, send_default_pii=False)
    worker_id = settings.worker_id or f"{socket.gethostname()}-{os.getpid()}-{uuid4().hex[:8]}"
    service_key = settings.supabase_service_role_key.get_secret_value()
    embeddings = SentenceTransformerEmbedding(
        settings.embedding_model_id,
        dimension=settings.embedding_dimension,
    )
    repository = SupabaseSyncRepository(
        settings.supabase_url,
        service_key,
        worker_id,
        lock_timeout_seconds=settings.worker_claim_stale_seconds,
    )
    source_loader = SupabaseSourceLoader(settings.supabase_url, service_key)
    try:
        await embeddings.load()
        worker = SyncWorker(repository, source_loader, embeddings)
        while True:
            processed = await worker.process_once()
            if not processed:
                await asyncio.sleep(settings.worker_poll_seconds)
    finally:
        await source_loader.close()
        await repository.close()
        await embeddings.close()


def run() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    run()
