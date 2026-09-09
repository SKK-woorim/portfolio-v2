from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.contracts import HistoryMessage, SourceItem
from app.supabase_auth import service_api_headers

SourceType = Literal["profile", "portfolio", "post"]
_KEBAB_SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
_SAFE_SOURCE_URL = re.compile(rf"^/(?:about|portfolio/{_KEBAB_SLUG}|blog/{_KEBAB_SLUG})$")
_PROFILE_INTENT_TERMS = (
    "송경근",
    "프로필",
    "소개",
    "기술 스택",
    "기술스택",
    "보유 기술",
    "역량",
    "협업",
    "연락",
    "이메일",
    "email",
    "contact",
)
_PRIVATE_PERSONAL_TERMS = (
    "집 주소",
    "집주소",
    "개인 주소",
    "거주지",
    "전화번호",
    "휴대전화",
    "휴대폰",
    "핸드폰",
    "주민등록",
)
_PROFILE_THRESHOLD_MARGIN = 0.08
_PROFILE_SCORE_BONUS = 0.08


def is_safe_source_url(value: str) -> bool:
    return bool(_SAFE_SOURCE_URL.fullmatch(value))


def build_search_query(message: str, history: Sequence[HistoryMessage]) -> str:
    previous = next((item.content for item in reversed(history) if item.role == "user"), None)
    if previous:
        return f"이전 질문: {previous}\n현재 질문: {message}"
    return message


@dataclass(frozen=True)
class RetrievalCandidate:
    chunk_id: str
    document_id: str
    revision_id: str
    active_revision: str
    index_status: str
    source_type: SourceType
    title: str
    source_url: str
    content: str
    token_count: int
    similarity: float
    tags: tuple[str, ...] = ()
    heading: str | None = None

    @classmethod
    def from_rpc(cls, row: dict[str, Any]) -> RetrievalCandidate:
        source_type = str(row["source_type"])
        if source_type not in {"profile", "portfolio", "post"}:
            raise ValueError("invalid source type returned by retrieval RPC")
        source_url = str(row["source_url"])
        if not is_safe_source_url(source_url):
            raise ValueError("unsafe source URL returned by retrieval RPC")
        if (
            (source_type == "profile" and source_url != "/about")
            or (source_type == "portfolio" and not source_url.startswith("/portfolio/"))
            or (source_type == "post" and not source_url.startswith("/blog/"))
        ):
            raise ValueError("source type and URL do not match")
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        tags_value = row.get("tags") or metadata.get("tags") or []
        if not isinstance(tags_value, list):
            tags_value = []
        revision_id = str(row.get("revision_id", "rpc-verified"))
        return cls(
            chunk_id=str(row["chunk_id"]),
            document_id=str(row["document_id"]),
            revision_id=revision_id,
            # The SECURITY DEFINER RPC guarantees ready + active revision. If it
            # also returns the defense-in-depth fields, verify them below.
            active_revision=str(row.get("active_revision", revision_id)),
            index_status=str(row.get("index_status", "ready")),
            source_type=source_type,  # type: ignore[arg-type]
            title=str(row["title"]),
            source_url=source_url,
            content=str(row["content"]),
            token_count=max(0, int(row.get("token_count", 0))),
            similarity=float(row["similarity"]),
            tags=tuple(str(tag) for tag in tags_value if str(tag).strip()),
            heading=str(row["heading"]) if row.get("heading") else None,
        )

    @property
    def is_active(self) -> bool:
        return self.index_status == "ready" and self.revision_id == self.active_revision


@dataclass(frozen=True)
class RetrievalResult:
    chunks: tuple[RetrievalCandidate, ...]

    @property
    def sources(self) -> list[SourceItem]:
        items: list[SourceItem] = []
        seen: set[str] = set()
        for chunk in self.chunks:
            if chunk.document_id in seen:
                continue
            seen.add(chunk.document_id)
            items.append(
                SourceItem(
                    id=f"S{len(items) + 1}",
                    title=chunk.title,
                    type=chunk.source_type,
                    url=chunk.source_url,
                )
            )
            if len(items) == 3:
                break
        return items

    def source_id_for(self, chunk: RetrievalCandidate) -> str:
        for source in self.sources:
            if source.url == chunk.source_url:
                return source.id
        raise KeyError(chunk.document_id)


def select_candidates(
    candidates: Sequence[RetrievalCandidate],
    query: str,
    *,
    threshold: float,
    max_chunks: int = 5,
    max_per_document: int = 2,
    max_context_tokens: int = 4000,
) -> RetrievalResult:
    normalized_query = query.casefold()
    if any(term in normalized_query for term in _PRIVATE_PERSONAL_TERMS):
        return RetrievalResult(())
    profile_intent = any(term in normalized_query for term in _PROFILE_INTENT_TERMS)

    def score(candidate: RetrievalCandidate) -> float:
        title = candidate.title.casefold().strip()
        bonus = (
            _PROFILE_SCORE_BONUS if profile_intent and candidate.source_type == "profile" else 0.0
        )
        if title and title in normalized_query:
            bonus += 0.04
        elif title and any(part in normalized_query for part in title.split() if len(part) >= 2):
            bonus += 0.02
        for tag in candidate.tags:
            if tag.casefold() in normalized_query:
                bonus += 0.02
                break
        return candidate.similarity + bonus

    ranked = sorted(
        (
            candidate
            for candidate in candidates
            if candidate.is_active
            and candidate.similarity
            >= (
                threshold - _PROFILE_THRESHOLD_MARGIN
                if profile_intent and candidate.source_type == "profile"
                else threshold
            )
            and candidate.content.strip()
        ),
        key=score,
        reverse=True,
    )
    selected: list[RetrievalCandidate] = []
    document_counts: defaultdict[str, int] = defaultdict(int)
    tokens = 0
    for candidate in ranked:
        if document_counts[candidate.document_id] >= max_per_document:
            continue
        if candidate.token_count > max_context_tokens:
            continue
        if tokens + candidate.token_count > max_context_tokens:
            continue
        selected.append(candidate)
        document_counts[candidate.document_id] += 1
        tokens += candidate.token_count
        if len(selected) >= max_chunks:
            break
    return RetrievalResult(tuple(selected))


class SupabaseRetriever:
    def __init__(
        self,
        base_url: str,
        service_role_key: str,
        *,
        threshold: float,
        candidate_count: int = 12,
        max_chunks: int = 5,
        max_per_document: int = 2,
        max_context_tokens: int = 4000,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.threshold = threshold
        self.candidate_count = candidate_count
        self.max_chunks = max_chunks
        self.max_per_document = max_per_document
        self.max_context_tokens = max_context_tokens
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            headers=service_api_headers(service_role_key, json_content=True),
            timeout=15.0,
        )

    async def search(self, query: str, query_embedding: Sequence[float]) -> RetrievalResult:
        response = await self._client.post(
            f"{self.base_url}/rest/v1/rpc/match_knowledge_chunks",
            json={
                "p_query_embedding": list(query_embedding),
                "p_match_count": self.candidate_count,
            },
        )
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise TypeError("retrieval RPC returned a non-list response")
        candidates = [RetrievalCandidate.from_rpc(row) for row in rows]
        return select_candidates(
            candidates,
            query,
            threshold=self.threshold,
            max_chunks=self.max_chunks,
            max_per_document=self.max_per_document,
            max_context_tokens=self.max_context_tokens,
        )

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
