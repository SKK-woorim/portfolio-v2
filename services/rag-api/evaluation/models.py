from __future__ import annotations

from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.contracts import ChatRequest
from app.retrieval import is_safe_source_url

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class EvaluationDefaults(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_first_token_ms: int = Field(default=90_000, alias="maxFirstTokenMs", ge=1)
    max_total_ms: int = Field(default=240_000, alias="maxTotalMs", ge=1)

    @model_validator(mode="after")
    def validate_latency_limits(self) -> EvaluationDefaults:
        if self.max_first_token_ms >= self.max_total_ms:
            raise ValueError("maxFirstTokenMs must be shorter than maxTotalMs")
        return self


class EvaluationCase(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    group: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    question: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
    ]
    expected_source_patterns: list[NonEmptyText] = Field(
        default_factory=list,
        alias="expectedSourcePatterns",
    )
    expected_terms: list[NonEmptyText] = Field(default_factory=list, alias="expectedTerms")
    must_not_contain: list[NonEmptyText] = Field(default_factory=list, alias="mustNotContain")
    expect_no_relevant_context: bool = Field(
        default=False,
        alias="expectNoRelevantContext",
    )
    expect_refusal: bool = Field(default=False, alias="expectRefusal")
    max_first_token_ms: int | None = Field(default=None, alias="maxFirstTokenMs", ge=1)
    max_total_ms: int | None = Field(default=None, alias="maxTotalMs", ge=1)
    critical: bool = False
    notes: str | None = None

    @field_validator("expected_source_patterns")
    @classmethod
    def validate_source_patterns(cls, values: list[str]) -> list[str]:
        for value in values:
            if value in {"/portfolio/*", "/blog/*"}:
                continue
            if not is_safe_source_url(value):
                raise ValueError(f"unsupported source pattern: {value}")
        return values

    @field_validator("expected_source_patterns", "expected_terms", "must_not_contain")
    @classmethod
    def reject_duplicate_expectations(cls, values: list[str]) -> list[str]:
        normalized = [value.casefold() for value in values]
        if len(normalized) != len(set(normalized)):
            raise ValueError("expectation lists must not contain duplicates")
        return values

    @model_validator(mode="after")
    def validate_outcome(self) -> EvaluationCase:
        # Reuse the live request contract so an evaluation case cannot contain a
        # question that the API would reject.
        ChatRequest(sessionId="00000000-0000-0000-0000-000000000000", message=self.question)
        if self.expect_no_relevant_context and (
            self.expected_source_patterns or self.expected_terms
        ):
            raise ValueError("no-context cases cannot require sources or answer terms")
        if self.max_first_token_ms and self.max_total_ms:
            if self.max_first_token_ms >= self.max_total_ms:
                raise ValueError("maxFirstTokenMs must be shorter than maxTotalMs")
        return self


class EvaluationDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1)
    description: NonEmptyText
    defaults: EvaluationDefaults = Field(default_factory=EvaluationDefaults)
    cases: list[EvaluationCase] = Field(min_length=1)

    @model_validator(mode="after")
    def reject_duplicate_ids(self) -> EvaluationDataset:
        ids = [case.id for case in self.cases]
        if len(ids) != len(set(ids)):
            raise ValueError("case ids must be unique")
        for case in self.cases:
            first_token_ms = case.max_first_token_ms or self.defaults.max_first_token_ms
            total_ms = case.max_total_ms or self.defaults.max_total_ms
            if first_token_ms >= total_ms:
                raise ValueError(
                    f"case {case.id}: effective maxFirstTokenMs must be shorter than maxTotalMs"
                )
        return self


def load_dataset(path: Path) -> tuple[EvaluationDataset, bytes]:
    raw = path.read_bytes()
    return EvaluationDataset.model_validate_json(raw), raw
