from __future__ import annotations

import re

from conftest import CharTokenizer

from worker.chunking import chunk_document
from worker.models import SourceDocument
from worker.normalization import clean_plain_text, normalize_document


def test_clean_plain_text_removes_html_images_and_urls_but_keeps_link_label() -> None:
    raw = "<script>secret()</script><p>본문 [문서](https://evil.test) ![img](x.png)</p> https://x.test"
    clean = clean_plain_text(raw)
    assert "secret" not in clean
    assert "https://" not in clean
    assert "img" not in clean
    assert "본문 문서" in clean


def test_normalize_portfolio_has_labeled_fields_without_link_urls() -> None:
    source = SourceDocument(
        source_type="portfolio",
        source_id="id",
        slug="rag-project",
        title="RAG 프로젝트",
        source_url="/portfolio/rag-project",
        updated_at="2026-01-01",
        status="published",
        fields={
            "type": "AI",
            "summary": "검색 시스템",
            "content": "## 설계\n안전한 검색 본문",
            "start_date": "2025-01",
            "end_date": "2025-06",
            "link_labels": ["GitHub"],
        },
        tags=("RAG", "Python"),
    )
    text = normalize_document(source)
    assert "[문서 유형] 포트폴리오" in text
    assert "[태그] RAG, Python" in text
    assert "[공개 링크] GitHub" in text
    assert text.endswith("[출처] /portfolio/rag-project")


def test_default_chunking_preserves_heading_max_and_overlap() -> None:
    tokenizer = CharTokenizer()
    first = "첫 번째 문장입니다. " * 90
    second = "두 번째 제목의 설명입니다. " * 70
    chunks = chunk_document(
        f"## 설계\n{first}\n## 결과\n{second}",
        tokenizer,
        title="긴 문서",
        document_type="portfolio",
        tags=("RAG",),
    )
    assert len(chunks) >= 4
    assert {chunk.heading for chunk in chunks} == {"설계", "결과"}
    assert all(chunk.token_count <= 600 for chunk in chunks)
    assert all("[문서 유형] portfolio" in chunk.content for chunk in chunks)
    assert all(len(re.sub(r"\s+", "", chunk.content)) >= 30 for chunk in chunks)

    design = [chunk for chunk in chunks if chunk.heading == "설계"]
    prefix = "[문서 유형] portfolio\n[제목] 긴 문서\n[태그] RAG\n[현재 제목] 설계\n\n"
    left = design[0].content.removeprefix(prefix)
    right = design[1].content.removeprefix(prefix)
    assert left[-80:] == right[:80]


def test_chunking_rejects_invalid_limits_and_drops_tiny_sections() -> None:
    tokenizer = CharTokenizer()
    assert (
        chunk_document(
            "## 메모\n짧음",
            tokenizer,
            title="문서",
            document_type="post",
        )
        == []
    )
