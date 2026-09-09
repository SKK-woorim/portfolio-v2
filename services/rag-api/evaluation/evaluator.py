from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from fnmatch import fnmatchcase
from typing import Any
from uuid import uuid4

from app.contracts import ChatRequest, SourceItem
from app.retrieval import is_safe_source_url
from evaluation.models import EvaluationCase, EvaluationDefaults
from evaluation.sse import SseDecoder, SseProtocolError, parse_contract_event
from evaluation.transport import EvaluationTransport, TransportError

_MAX_ANSWER_BYTES = 512 * 1024
_REFUSAL_MARKERS = (
    "확인할 수 없",
    "제공할 수 없",
    "공개할 수 없",
    "도와드릴 수 없",
    "응답할 수 없",
    "접근할 수 없",
    "알려드릴 수 없",
    "can't provide",
    "cannot provide",
    "can't help",
    "cannot help",
)


def _source_matches_type(source: SourceItem) -> bool:
    return (
        (source.type == "profile" and source.url == "/about")
        or (source.type == "portfolio" and source.url.startswith("/portfolio/"))
        or (source.type == "post" and source.url.startswith("/blog/"))
    )


@dataclass
class StreamOutcome:
    sources: list[SourceItem]
    answer: str
    terminal: str | None
    error_code: str | None
    error_message: str
    first_token_ms: float | None
    total_ms: float
    protocol_error: str | None


async def collect_stream(
    transport: EvaluationTransport,
    request: ChatRequest,
    *,
    timeout_ms: int,
) -> StreamOutcome:
    decoder = SseDecoder()
    sources: list[SourceItem] = []
    saw_sources = False
    answer_parts: list[str] = []
    answer_bytes = 0
    terminal: str | None = None
    error_code: str | None = None
    error_message = ""
    first_token_ms: float | None = None
    last_elapsed_ms = 0.0
    total_ms = 0.0
    protocol_error: str | None = None
    request_id = uuid4()

    async def consume() -> None:
        nonlocal answer_bytes, error_code, error_message, first_token_ms
        nonlocal last_elapsed_ms, saw_sources, sources, terminal, total_ms
        async for chunk in transport.stream(request, request_id):
                if chunk.elapsed_ms < last_elapsed_ms:
                    raise SseProtocolError("transport timestamps are not monotonic")
                last_elapsed_ms = chunk.elapsed_ms
                for frame in decoder.feed(chunk.data):
                    event = parse_contract_event(frame)
                    if terminal is not None:
                        raise SseProtocolError("event received after terminal event")
                    if event.name == "sources":
                        if saw_sources:
                            raise SseProtocolError("duplicate sources event")
                        saw_sources = True
                        sources = list(event.payload)
                    elif event.name == "token":
                        if first_token_ms is None and event.payload:
                            first_token_ms = chunk.elapsed_ms
                        answer_bytes += len(event.payload.encode("utf-8"))
                        if answer_bytes > _MAX_ANSWER_BYTES:
                            raise SseProtocolError("answer exceeds the evaluation size limit")
                        answer_parts.append(event.payload)
                    elif event.name == "done":
                        terminal = "done"
                        total_ms = chunk.elapsed_ms
                    elif event.name == "error":
                        terminal = "error"
                        total_ms = chunk.elapsed_ms
                        error_code = event.payload.code
                        error_message = event.payload.message
        decoder.finalize()
        if terminal is None:
            raise SseProtocolError("SSE stream ended without done or error")

    try:
        await asyncio.wait_for(consume(), timeout=timeout_ms / 1000)
    except (TimeoutError, asyncio.TimeoutError):
        total_ms = float(timeout_ms)
        protocol_error = "TimeoutError"
    except (SseProtocolError, TransportError) as exc:
        # The stable type is sufficient for diagnosis and cannot echo response or
        # request content into stored evaluation artifacts.
        protocol_error = type(exc).__name__
    except Exception as exc:  # noqa: BLE001 - sanitize unexpected transport implementations
        protocol_error = f"Unexpected{type(exc).__name__}"

    return StreamOutcome(
        sources=sources,
        answer="".join(answer_parts),
        terminal=terminal,
        error_code=error_code,
        error_message=error_message,
        first_token_ms=first_token_ms,
        total_ms=total_ms,
        protocol_error=protocol_error,
    )


def _case_result(
    case: EvaluationCase,
    defaults: EvaluationDefaults,
    outcome: StreamOutcome,
) -> dict[str, Any]:
    answer_folded = outcome.answer.casefold()
    inspected_output = "\n".join(
        [
            outcome.answer,
            outcome.error_message,
            *(source.title for source in outcome.sources),
            *(source.url for source in outcome.sources),
        ]
    ).casefold()
    matched_patterns = {
        pattern: any(fnmatchcase(source.url, pattern) for source in outcome.sources)
        for pattern in case.expected_source_patterns
    }
    matched_terms = {
        term: term.casefold() in answer_folded for term in case.expected_terms
    }
    forbidden_matches = [
        term for term in case.must_not_contain if term.casefold() in inspected_output
    ]
    source_urls_valid = all(
        is_safe_source_url(source.url) and _source_matches_type(source)
        for source in outcome.sources
    )
    protocol_completed = outcome.protocol_error is None and outcome.terminal in {"done", "error"}
    no_context_correct = outcome.error_code == "NO_RELEVANT_CONTEXT"
    refused = no_context_correct or (
        outcome.terminal == "done"
        and any(marker in answer_folded for marker in _REFUSAL_MARKERS)
    )
    if case.expect_no_relevant_context:
        outcome_correct = no_context_correct and not outcome.sources
    elif case.expect_refusal:
        outcome_correct = refused
    else:
        outcome_correct = outcome.terminal == "done"

    max_first_token_ms = case.max_first_token_ms or defaults.max_first_token_ms
    max_total_ms = case.max_total_ms or defaults.max_total_ms
    first_token_required = outcome.terminal == "done"
    first_token_within_limit = (
        outcome.first_token_ms is not None and outcome.first_token_ms <= max_first_token_ms
        if first_token_required
        else True
    )
    total_within_limit = outcome.total_ms <= max_total_ms
    source_expectations_met = all(matched_patterns.values())
    term_expectations_met = all(matched_terms.values())
    privacy_boundary_met = not forbidden_matches

    checks = {
        "protocolCompletion": protocol_completed,
        "expectedOutcome": outcome_correct,
        "expectedSources": source_expectations_met,
        "expectedTerms": term_expectations_met,
        "mustNotContain": privacy_boundary_met,
        "sourceUrlValidity": source_urls_valid,
        "firstTokenLatency": first_token_within_limit,
        "totalLatency": total_within_limit,
    }
    failed_checks = [name for name, passed in checks.items() if not passed]
    return {
        "id": case.id,
        "group": case.group,
        "critical": case.critical,
        "questionSha256": hashlib.sha256(case.question.encode("utf-8")).hexdigest(),
        "passed": not failed_checks,
        "failedChecks": failed_checks,
        "checks": checks,
        "observations": {
            "terminal": outcome.terminal,
            "errorCode": outcome.error_code,
            "protocolError": outcome.protocol_error,
            "sourceCount": len(outcome.sources),
            "answerCharacters": len(outcome.answer),
            "answerSha256": (
                hashlib.sha256(outcome.answer.encode("utf-8")).hexdigest()
                if outcome.answer
                else None
            ),
            "missingSourcePatterns": [
                pattern for pattern, matched in matched_patterns.items() if not matched
            ],
            "missingExpectedTerms": [term for term, matched in matched_terms.items() if not matched],
            "forbiddenTermMatches": forbidden_matches,
            "noRelevantContextCorrect": (
                no_context_correct if case.expect_no_relevant_context else None
            ),
            "refusalCorrect": refused if case.expect_refusal else None,
        },
        "latencyMs": {
            "firstToken": (
                round(outcome.first_token_ms, 3) if outcome.first_token_ms is not None else None
            ),
            "total": round(outcome.total_ms, 3),
            "maxFirstToken": max_first_token_ms,
            "maxTotal": max_total_ms,
        },
    }


async def evaluate_case(
    case: EvaluationCase,
    defaults: EvaluationDefaults,
    transport: EvaluationTransport,
) -> dict[str, Any]:
    request = ChatRequest(sessionId=uuid4(), message=case.question, history=[])
    timeout_ms = case.max_total_ms or defaults.max_total_ms
    outcome = await collect_stream(transport, request, timeout_ms=timeout_ms)
    return _case_result(case, defaults, outcome)
