from __future__ import annotations

import html
import re
from collections.abc import Iterable

from worker.models import SourceDocument

_SCRIPT_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_HTML_TAG = re.compile(r"<[^>]+>")
_MARKDOWN_IMAGE = re.compile(r"!\[[^\]]*]\([^)]*\)")
_MARKDOWN_LINK = re.compile(r"\[([^\]]+)]\([^)]*\)")
_BARE_URL = re.compile(r"https?://\S+", re.IGNORECASE)
_SPACE = re.compile(r"[ \t]+")
_BLANKS = re.compile(r"\n{3,}")


def clean_plain_text(value: object) -> str:
    text = html.unescape(str(value or "")).replace("\r\n", "\n").replace("\r", "\n")
    text = _SCRIPT_STYLE.sub("", text)
    text = _MARKDOWN_IMAGE.sub("", text)
    text = _MARKDOWN_LINK.sub(r"\1", text)
    text = _HTML_TAG.sub("", text)
    text = _BARE_URL.sub("", text)
    lines = [_SPACE.sub(" ", line).strip() for line in text.splitlines()]
    return _BLANKS.sub("\n\n", "\n".join(lines)).strip()


def _line(label: str, value: object) -> str | None:
    clean = clean_plain_text(value)
    return f"[{label}] {clean}" if clean else None


def _labels(label: str, values: Iterable[object]) -> str | None:
    clean = [clean_plain_text(item) for item in values]
    clean = [item for item in clean if item]
    return f"[{label}] {', '.join(clean)}" if clean else None


def normalize_document(document: SourceDocument) -> str:
    kind = {"profile": "프로필", "portfolio": "포트폴리오", "post": "블로그"}[document.source_type]
    fields = document.fields
    header: list[str | None] = [
        _line("문서 유형", kind),
        _line("제목", document.title),
    ]
    body: list[str] = []

    if document.source_type == "profile":
        header.extend(
            [
                _line("직무", fields.get("role_title")),
                _line("소개", fields.get("headline")),
                _labels("기술", document.tags),
                _line("공개 이메일", fields.get("email")),
                _labels("소셜 링크", fields.get("social_labels") or []),
            ]
        )
        bio = clean_plain_text(fields.get("bio"))
        if bio:
            body.extend(["## 소개", bio])
    elif document.source_type == "portfolio":
        period = " ~ ".join(
            item
            for item in [
                clean_plain_text(fields.get("start_date")),
                clean_plain_text(fields.get("end_date")),
            ]
            if item
        )
        header.extend(
            [
                _line("유형", fields.get("type")),
                _line("기간", period),
                _line("요약", fields.get("summary")),
                _labels("태그", document.tags),
                _labels("공개 링크", fields.get("link_labels") or []),
            ]
        )
        content = clean_plain_text(fields.get("content"))
        if content:
            body.extend(["## 본문", content])
    else:
        header.extend(
            [
                _line("요약", fields.get("summary")),
                _line("카테고리", fields.get("category")),
                _labels("태그", document.tags),
                _line("발행일", fields.get("published_at")),
            ]
        )
        content = clean_plain_text(fields.get("content"))
        if content:
            body.extend(["## 본문", content])

    lines = [item for item in header if item]
    lines.extend(body)
    lines.append(f"[출처] {document.source_url}")
    return "\n".join(lines).strip()
