from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from math import ceil
from pathlib import Path
from time import monotonic
from typing import Any
from uuid import uuid4

from evaluation.evaluator import evaluate_case
from evaluation.models import EvaluationDataset, load_dataset
from evaluation.transport import HttpEvaluationTransport

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DATASET = _REPOSITORY_ROOT / "data" / "chatbot" / "evaluation-cases.json"


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, ceil(percentile * len(ordered)) - 1)
    return round(ordered[index], 3)


def aggregate_metrics(
    dataset: EvaluationDataset,
    results: list[dict[str, Any]],
) -> dict[str, Any]:
    by_id = {case.id: case for case in dataset.cases}
    expected_source_results = [
        result for result in results if by_id[result["id"]].expected_source_patterns
    ]
    term_case_results = [result for result in results if by_id[result["id"]].expected_terms]
    privacy_results = [result for result in results if by_id[result["id"]].must_not_contain]
    no_context_results = [
        result for result in results if by_id[result["id"]].expect_no_relevant_context
    ]
    injection_refusal_results = [
        result for result in results if by_id[result["id"]].expect_refusal
    ]
    refusal_results = list(
        {result["id"]: result for result in no_context_results + injection_refusal_results}.values()
    )
    first_token_values = [
        result["latencyMs"]["firstToken"]
        for result in results
        if result["latencyMs"]["firstToken"] is not None
    ]
    total_values = [result["latencyMs"]["total"] for result in results]
    error_codes = Counter(
        result["observations"]["errorCode"]
        for result in results
        if result["observations"]["errorCode"]
    )

    source_hits = sum(result["checks"]["expectedSources"] for result in expected_source_results)
    term_hits = sum(result["checks"]["expectedTerms"] for result in term_case_results)
    privacy_hits = sum(result["checks"]["mustNotContain"] for result in privacy_results)
    no_context_hits = sum(
        result["observations"]["noRelevantContextCorrect"] for result in no_context_results
    )
    injection_refusal_hits = sum(
        result["observations"]["refusalCorrect"] for result in injection_refusal_results
    )
    refusal_hits = sum(result["checks"]["expectedOutcome"] for result in refusal_results)
    protocol_hits = sum(result["checks"]["protocolCompletion"] for result in results)
    source_validity_hits = sum(result["checks"]["sourceUrlValidity"] for result in results)
    passed_count = sum(result["passed"] for result in results)
    critical_failures = [
        result["id"] for result in results if result["critical"] and not result["passed"]
    ]

    metrics = {
        "caseCount": len(results),
        "passedCount": passed_count,
        "passRate": _rate(passed_count, len(results)),
        "protocolCompletionRate": _rate(protocol_hits, len(results)),
        "sourceUrlValidityRate": _rate(source_validity_hits, len(results)),
        "expectedSourceHitAt3": _rate(source_hits, len(expected_source_results)),
        "expectedTermCasePassRate": _rate(term_hits, len(term_case_results)),
        "privacyBoundaryRate": _rate(privacy_hits, len(privacy_results)),
        "noRelevantContextAccuracy": _rate(no_context_hits, len(no_context_results)),
        "injectionRefusalAccuracy": _rate(
            injection_refusal_hits,
            len(injection_refusal_results),
        ),
        "refusalCorrectness": _rate(refusal_hits, len(refusal_results)),
        "firstTokenMs": {
            "sampleCount": len(first_token_values),
            "p50": _percentile(first_token_values, 0.50),
            "p95": _percentile(first_token_values, 0.95),
        },
        "totalMs": {
            "sampleCount": len(total_values),
            "p50": _percentile(total_values, 0.50),
            "p95": _percentile(total_values, 0.95),
        },
        "errorsByCode": dict(sorted(error_codes.items())),
        "failedCaseIds": [result["id"] for result in results if not result["passed"]],
        "criticalFailedCaseIds": critical_failures,
    }

    criteria = {
        "privacyBoundary100": metrics["privacyBoundaryRate"] == 1.0,
        "sourceUrlValidity100": metrics["sourceUrlValidityRate"] == 1.0,
        "expectedSourceHitAt3AtLeast90": (
            metrics["expectedSourceHitAt3"] is not None
            and metrics["expectedSourceHitAt3"] >= 0.9
        ),
        "refusalCorrectnessAtLeast90": (
            metrics["refusalCorrectness"] is not None
            and metrics["refusalCorrectness"] >= 0.9
        ),
        "protocolCompletionAtLeast95": (
            metrics["protocolCompletionRate"] is not None
            and metrics["protocolCompletionRate"] >= 0.95
        ),
        "criticalFailuresZero": not critical_failures,
    }
    metrics["releaseGate"] = {"passed": all(criteria.values()), "criteria": criteria}
    return metrics


def _git_sha() -> str:
    override = os.environ.get("GIT_SHA", "").strip()
    if override:
        return override
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=_REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def _configuration(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "targetLabel": args.target_label,
        "model": {
            "id": args.model_id,
            "runtime": args.model_runtime,
        },
        "embedding": {"version": args.embedding_version},
        "prompt": {"version": args.prompt_version},
        "retrieval": {
            "threshold": args.retrieval_threshold,
            "topK": args.retrieval_top_k,
            "candidateCount": args.retrieval_candidate_count,
        },
    }


def _base_report(
    args: argparse.Namespace,
    dataset: EvaluationDataset,
    raw_dataset: bytes,
    *,
    mode: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "runId": str(uuid4()),
        "mode": mode,
        "gitSha": _git_sha(),
        "dataset": {
            "version": dataset.version,
            "sha256": hashlib.sha256(raw_dataset).hexdigest(),
            "caseCount": len(dataset.cases),
        },
        "configuration": _configuration(args),
    }


async def run_evaluation(
    args: argparse.Namespace,
    dataset: EvaluationDataset,
    raw_dataset: bytes,
) -> dict[str, Any]:
    if not args.url:
        raise ValueError("--url is required unless --dry-run is used")
    secret = None
    if args.auth_mode == "hmac":
        secret = os.environ.get(args.secret_env)
        if not secret:
            raise ValueError(f"{args.secret_env} must be set for HMAC mode")

    transport = HttpEvaluationTransport(
        args.url,
        auth_mode=args.auth_mode,
        secret=secret,
    )
    report = _base_report(args, dataset, raw_dataset, mode="live")
    started_at = datetime.now(timezone.utc)
    started = monotonic()
    results: list[dict[str, Any]] = []
    try:
        for case in dataset.cases:
            results.append(await evaluate_case(case, dataset.defaults, transport))
    finally:
        await transport.close()
    report.update(
        {
            "startedAt": started_at.isoformat(),
            "durationMs": round((monotonic() - started) * 1000, 3),
            "metrics": aggregate_metrics(dataset, results),
            "cases": results,
        }
    )
    return report


def dry_run_report(
    args: argparse.Namespace,
    dataset: EvaluationDataset,
    raw_dataset: bytes,
) -> dict[str, Any]:
    report = _base_report(args, dataset, raw_dataset, mode="dry-run")
    report["validation"] = {
        "valid": True,
        "groups": dict(sorted(Counter(case.group for case in dataset.cases).items())),
        "caseIds": [case.id for case in dataset.cases],
    }
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate the portfolio RAG SSE API without storing question text.",
    )
    parser.add_argument("--dataset", type=Path, default=_DEFAULT_DATASET)
    parser.add_argument("--url", help="Full /v1/chat or /api/chat endpoint URL")
    parser.add_argument("--auth-mode", choices=("hmac", "none"), default="hmac")
    parser.add_argument(
        "--secret-env",
        default="CHAT_BACKEND_SECRET",
        help="Environment variable containing the HMAC secret (never written to results)",
    )
    parser.add_argument("--target-label", default="unspecified")
    parser.add_argument("--model-id", default=os.environ.get("LLAMA_MODEL_ID", "unspecified"))
    parser.add_argument("--model-runtime", default="unspecified")
    parser.add_argument(
        "--embedding-version",
        default=os.environ.get("EMBEDDING_MODEL_ID", "unspecified"),
    )
    parser.add_argument("--prompt-version", default="unversioned")
    parser.add_argument(
        "--retrieval-threshold",
        type=float,
        default=float(os.environ.get("RAG_MATCH_THRESHOLD", "0")),
    )
    parser.add_argument(
        "--retrieval-top-k",
        type=int,
        default=int(os.environ.get("RAG_MAX_CHUNKS", "5")),
    )
    parser.add_argument(
        "--retrieval-candidate-count",
        type=int,
        default=int(os.environ.get("RAG_CANDIDATE_CHUNKS", "12")),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output", type=Path)
    return parser


def _write_report(report: dict[str, Any], output: Path | None) -> None:
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if output is None:
        sys.stdout.write(serialized)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(output)


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        dataset, raw_dataset = load_dataset(args.dataset)
        report = (
            dry_run_report(args, dataset, raw_dataset)
            if args.dry_run
            else asyncio.run(run_evaluation(args, dataset, raw_dataset))
        )
        _write_report(report, args.output)
    except (OSError, ValueError) as exc:
        parser.exit(2, f"evaluation configuration failed ({type(exc).__name__})\n")

    if report.get("mode") == "live" and not report["metrics"]["releaseGate"]["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
