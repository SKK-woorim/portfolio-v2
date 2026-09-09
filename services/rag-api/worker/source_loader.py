from __future__ import annotations

from typing import Any

import httpx

from app.supabase_auth import service_api_headers
from worker.models import ClaimedJob, SourceDocument


class SourceNotFoundError(RuntimeError):
    pass


class SupabaseSourceLoader:
    def __init__(
        self,
        base_url: str,
        service_role_key: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            headers=service_api_headers(service_role_key),
            timeout=15.0,
        )

    async def load(self, job: ClaimedJob) -> SourceDocument:
        if job.source_type == "profile":
            row = await self._one(
                "site_profile",
                {
                    "select": "display_name,role_title,headline,bio,contact,social_links,skills,updated_at",
                    "id": "eq.true",
                    "limit": "1",
                },
            )
            contact = row.get("contact") if isinstance(row.get("contact"), dict) else {}
            socials = row.get("social_links") if isinstance(row.get("social_links"), list) else []
            return SourceDocument(
                source_type="profile",
                source_id="site",
                slug=None,
                title=str(row.get("display_name") or job.title),
                source_url="/about",
                updated_at=str(row.get("updated_at") or job.source_updated_at),
                status="published",
                fields={
                    "role_title": row.get("role_title", ""),
                    "headline": row.get("headline", ""),
                    "bio": row.get("bio", ""),
                    "email": contact.get("email", ""),
                    "social_labels": [
                        str(item.get("label"))
                        for item in socials
                        if isinstance(item, dict) and item.get("label")
                    ],
                },
                tags=tuple(str(skill) for skill in row.get("skills") or [] if str(skill).strip()),
            )

        if job.source_type == "portfolio":
            row = await self._one(
                "portfolio_items",
                {
                    "select": (
                        "id,slug,title,type,summary,content_text,start_date,end_date,status,updated_at,"
                        "portfolio_tags(tags(name)),portfolio_links(label,sort_order)"
                    ),
                    "id": f"eq.{job.source_id}",
                    "limit": "1",
                },
            )
            tags = self._relation_tags(row.get("portfolio_tags"))
            links = (
                row.get("portfolio_links") if isinstance(row.get("portfolio_links"), list) else []
            )
            return SourceDocument(
                source_type="portfolio",
                source_id=job.source_id,
                slug=str(row.get("slug") or job.source_slug or ""),
                title=str(row.get("title") or job.title),
                source_url=job.source_url,
                updated_at=str(row.get("updated_at") or job.source_updated_at),
                status=str(row.get("status") or ""),
                fields={
                    "type": row.get("type", ""),
                    "summary": row.get("summary", ""),
                    "content": row.get("content_text", ""),
                    "start_date": row.get("start_date", ""),
                    "end_date": row.get("end_date", ""),
                    "link_labels": [
                        str(item.get("label"))
                        for item in links
                        if isinstance(item, dict) and item.get("label")
                    ],
                },
                tags=tags,
            )

        row = await self._one(
            "posts",
            {
                "select": (
                    "id,slug,title,excerpt,content_text,status,published_at,updated_at,"
                    "categories(name),post_tags(tags(name))"
                ),
                "id": f"eq.{job.source_id}",
                "limit": "1",
            },
        )
        category = row.get("categories") if isinstance(row.get("categories"), dict) else {}
        return SourceDocument(
            source_type="post",
            source_id=job.source_id,
            slug=str(row.get("slug") or job.source_slug or ""),
            title=str(row.get("title") or job.title),
            source_url=job.source_url,
            updated_at=str(row.get("updated_at") or job.source_updated_at),
            status=str(row.get("status") or ""),
            fields={
                "summary": row.get("excerpt", ""),
                "content": row.get("content_text", ""),
                "category": category.get("name", ""),
                "published_at": row.get("published_at", ""),
            },
            tags=self._relation_tags(row.get("post_tags")),
        )

    async def _one(self, table: str, params: dict[str, str]) -> dict[str, Any]:
        response = await self._client.get(f"{self.base_url}/rest/v1/{table}", params=params)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise SourceNotFoundError(f"{table} source row was not found")
        if not isinstance(rows[0], dict):
            raise TypeError("Supabase source response was malformed")
        return rows[0]

    @staticmethod
    def _relation_tags(value: Any) -> tuple[str, ...]:
        if not isinstance(value, list):
            return ()
        tags: list[str] = []
        for item in value:
            nested = item.get("tags") if isinstance(item, dict) else None
            name = nested.get("name") if isinstance(nested, dict) else None
            if name:
                tags.append(str(name))
        return tuple(tags)

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
