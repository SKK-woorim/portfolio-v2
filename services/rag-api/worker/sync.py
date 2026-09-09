from __future__ import annotations

import hashlib
import logging
from dataclasses import replace
from typing import Protocol

from app.embeddings import EmbeddingProvider
from worker.chunking import chunk_document
from worker.models import ChunkRecord, ClaimedJob, SourceDocument
from worker.normalization import normalize_document

logger = logging.getLogger(__name__)


class Repository(Protocol):
    async def claim(self) -> ClaimedJob | None: ...

    async def desired_revision(self, document_id: str) -> str | None: ...

    async def complete(
        self,
        job: ClaimedJob,
        *,
        content_hash: str | None = None,
        chunks: list[ChunkRecord] | None = None,
    ) -> dict[str, object]: ...

    async def fail(self, job: ClaimedJob, error: str) -> dict[str, object]: ...


class SourceLoader(Protocol):
    async def load(self, job: ClaimedJob) -> SourceDocument: ...


class SyncWorker:
    def __init__(
        self,
        repository: Repository,
        source_loader: SourceLoader,
        embeddings: EmbeddingProvider,
    ) -> None:
        self.repository = repository
        self.source_loader = source_loader
        self.embeddings = embeddings

    async def process_once(self) -> bool:
        job = await self.repository.claim()
        if job is None:
            return False
        try:
            if await self.repository.desired_revision(job.document_id) != job.revision_id:
                await self.repository.complete(job)
                return True

            if job.action in {"disable", "delete"}:
                await self.repository.complete(job)
                return True

            source = await self.source_loader.load(job)
            if not source.is_public:
                # A concurrent state transition creates a new desired revision.
                # The atomic RPC will mark this job stale instead of activating it.
                await self.repository.complete(job)
                return True

            normalized = normalize_document(source)
            content_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            chunks = chunk_document(
                normalized,
                self.embeddings.tokenizer,
                title=source.title,
                document_type=source.source_type,
                tags=source.tags,
            )
            if not chunks:
                raise RuntimeError("normalization produced no meaningful chunks")

            vectors = await self.embeddings.embed_documents([chunk.content for chunk in chunks])
            embedded = [
                replace(chunk, embedding=vector)
                for chunk, vector in zip(chunks, vectors, strict=True)
            ]

            # Avoid a large RPC when the job is already stale. The completion RPC
            # repeats this check under a document lock before atomic activation.
            if await self.repository.desired_revision(job.document_id) != job.revision_id:
                await self.repository.complete(job)
                return True
            result = await self.repository.complete(
                job,
                content_hash=content_hash,
                chunks=embedded,
            )
            logger.info(
                "sync completed job_id=%s document_id=%s result=%s chunks=%s",
                job.job_id,
                job.document_id,
                result.get("reason", "unknown"),
                len(embedded),
            )
        except Exception as exc:  # noqa: BLE001 - every job failure must enter DB retry flow
            # Never log source text, request headers, or credentials. Exception
            # type is sufficient for metrics; the DB gets a short generic reason.
            error = f"{type(exc).__name__}: synchronization step failed"
            logger.warning("sync failed job_id=%s error_type=%s", job.job_id, type(exc).__name__)
            failure = await self.repository.fail(job, error)
            if failure.get("reason") == "exhausted":
                logger.error(
                    "sync retries exhausted job_id=%s document_id=%s",
                    job.job_id,
                    job.document_id,
                )
                try:
                    import sentry_sdk
                except ImportError:
                    pass
                else:
                    sentry_sdk.capture_message(
                        f"RAG sync retries exhausted job_id={job.job_id} document_id={job.document_id}",
                        level="error",
                    )
        return True
