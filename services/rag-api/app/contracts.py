from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

TrimmedMessage = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]
TrimmedHistory = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
]


class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: TrimmedHistory


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    session_id: UUID = Field(alias="sessionId")
    message: TrimmedMessage
    history: list[HistoryMessage] = Field(default_factory=list, max_length=4)


class SourceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    type: Literal["profile", "portfolio", "post"]
    url: str


class ErrorPayload(BaseModel):
    code: Literal[
        "INVALID_REQUEST",
        "RATE_LIMITED",
        "SEARCH_UNAVAILABLE",
        "NO_RELEVANT_CONTEXT",
        "MODEL_BUSY",
        "MODEL_UNAVAILABLE",
        "FIRST_TOKEN_TIMEOUT",
        "GENERATION_TIMEOUT",
        "INTERNAL_ERROR",
    ]
    message: str
