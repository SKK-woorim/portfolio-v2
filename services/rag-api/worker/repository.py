from __future__ import annotations

from typing import Any

import httpx

from app.supabase_auth import service_api_headers
from worker.models import ChunkRecord, ClaimedJob


class SupabaseSyncRepository:
    def __init__(
        self,
        base_url: str,
        service_role_key: str,
        worker_id: str,
        *,
        lock_timeout_seconds: int = 600,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.worker_id = worker_id
        self.lock_timeout_seconds = lock_timeout_seconds
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            headers=service_api_headers(service_role_key, json_content=True),
            timeout=30.0,
        )

    async def claim(self) -> ClaimedJob | None:
        data = await self._rpc(
            "claim_knowledge_sync_job",
            {
                "p_worker_id": self.worker_id,
                "p_lock_timeout_seconds": self.lock_timeout_seconds,
            },
        )
        if not data:
            return None
        row = data[0] if isinstance(data, list) else data
        return ClaimedJob(
            job_id=int(row["job_id"]),
            document_id=str(row["document_id"]),
            revision_id=str(row["revision_id"]),
            action=str(row["action"]),  # type: ignore[arg-type]
            attempt_count=int(row["attempt_count"]),
            source_type=str(row["source_type"]),  # type: ignore[arg-type]
            source_id=str(row["source_id"]),
            source_slug=str(row["source_slug"]) if row.get("source_slug") else None,
            title=str(row["title"]),
            source_url=str(row["source_url"]),
            source_updated_at=str(row["source_updated_at"]),
        )

    async def desired_revision(self, document_id: str) -> str | None:
        response = await self._client.get(
            f"{self.base_url}/rest/v1/knowledge_documents",
            params={
                "select": "desired_revision",
                "id": f"eq.{document_id}",
                "limit": "1",
            },
        )
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            return None
        return str(rows[0]["desired_revision"])

    async def complete(
        self,
        job: ClaimedJob,
        *,
        content_hash: str | None = None,
        chunks: list[ChunkRecord] | None = None,
    ) -> dict[str, Any]:
        result = await self._rpc(
            "complete_knowledge_sync_job",
            {
                "p_job_id": job.job_id,
                "p_worker_id": self.worker_id,
                "p_revision_id": job.revision_id,
                "p_content_hash": content_hash,
                "p_chunks": [chunk.to_rpc() for chunk in chunks or []],
            },
        )
        if not isinstance(result, dict):
            raise TypeError("completion RPC returned malformed data")
        return result

    async def fail(self, job: ClaimedJob, error: str) -> dict[str, Any]:
        result = await self._rpc(
            "fail_knowledge_sync_job",
            {
                "p_job_id": job.job_id,
                "p_worker_id": self.worker_id,
                "p_revision_id": job.revision_id,
                "p_error": error[:300],
            },
        )
        if not isinstance(result, dict):
            raise TypeError("failure RPC returned malformed data")
        return result

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        response = await self._client.post(f"{self.base_url}/rest/v1/rpc/{name}", json=payload)
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
