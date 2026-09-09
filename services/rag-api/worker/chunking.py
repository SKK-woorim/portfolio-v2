from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import replace
from typing import Protocol

from worker.models import ChunkRecord

_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$")
_SENTENCE_END = re.compile(r"(?<=[.!?。！？])(?:\s+|$)|\n+")


class Tokenizer(Protocol):
    def encode(self, text: str) -> list[int]: ...

    def decode(self, token_ids: Sequence[int]) -> str: ...


def split_heading_sections(text: str) -> list[tuple[str | None, str]]:
    sections: list[tuple[str | None, str]] = []
    heading: str | None = None
    lines: list[str] = []
    for line in text.splitlines():
        match = _HEADING.fullmatch(line.strip())
        if match:
            content = "\n".join(lines).strip()
            if content:
                sections.append((heading, content))
            heading = match.group(1).strip()
            lines = []
        else:
            lines.append(line)
    content = "\n".join(lines).strip()
    if content:
        sections.append((heading, content))
    return sections


def _sentence_boundaries(text: str, tokenizer: Tokenizer) -> tuple[list[int], list[int]]:
    tokens: list[int] = []
    boundaries: list[int] = []
    pieces = [piece.strip() for piece in _SENTENCE_END.split(text) if piece.strip()]
    for piece in pieces:
        piece_tokens = tokenizer.encode(piece)
        if not piece_tokens:
            continue
        if tokens:
            tokens.extend(tokenizer.encode("\n"))
        tokens.extend(piece_tokens)
        boundaries.append(len(tokens))
    return tokens, boundaries


def chunk_document(
    text: str,
    tokenizer: Tokenizer,
    *,
    title: str,
    document_type: str,
    tags: Sequence[str] = (),
    target_tokens: int = 450,
    max_tokens: int = 600,
    overlap_tokens: int = 80,
    min_meaningful_chars: int = 30,
) -> list[ChunkRecord]:
    if not 0 <= overlap_tokens < target_tokens <= max_tokens:
        raise ValueError("require 0 <= overlap < target <= max")
    tag_text = ", ".join(tag.strip() for tag in tags if tag.strip())
    base_prefix = f"[문서 유형] {document_type}\n[제목] {title}"
    if tag_text:
        base_prefix += f"\n[태그] {tag_text}"

    chunks: list[ChunkRecord] = []
    for heading, section in split_heading_sections(text):
        if len(re.sub(r"\s+", "", section)) < min_meaningful_chars:
            continue
        prefix = base_prefix + (f"\n[현재 제목] {heading}" if heading else "")
        prefix_tokens = tokenizer.encode(prefix + "\n\n")
        target_body = target_tokens - len(prefix_tokens)
        max_body = max_tokens - len(prefix_tokens)
        if target_body <= overlap_tokens or max_body <= 0:
            raise ValueError("metadata prefix leaves no room for chunk content")

        body_tokens, boundaries = _sentence_boundaries(section, tokenizer)
        start = 0
        while start < len(body_tokens):
            desired_end = min(len(body_tokens), start + target_body)
            candidates = [boundary for boundary in boundaries if start < boundary <= desired_end]
            if candidates:
                end = max(candidates)
            else:
                end = min(len(body_tokens), start + max_body)
            if end <= start:
                break
            decoded = tokenizer.decode(body_tokens[start:end]).strip()
            content = f"{prefix}\n\n{decoded}".strip()
            token_count = len(tokenizer.encode(content))
            if token_count > max_tokens:
                allowed = max(1, max_body)
                decoded = tokenizer.decode(body_tokens[start : start + allowed]).strip()
                content = f"{prefix}\n\n{decoded}".strip()
                token_count = len(tokenizer.encode(content))
                end = min(len(body_tokens), start + allowed)
            if decoded and len(re.sub(r"\s+", "", decoded)) >= min_meaningful_chars:
                chunks.append(
                    ChunkRecord(
                        chunk_index=len(chunks),
                        heading=heading,
                        content=content,
                        token_count=token_count,
                        metadata={
                            "title": title,
                            "document_type": document_type,
                            "tags": list(tags),
                        },
                    )
                )
            if end >= len(body_tokens):
                break
            start = max(start + 1, end - overlap_tokens)
    return [replace(chunk, chunk_index=index) for index, chunk in enumerate(chunks)]
