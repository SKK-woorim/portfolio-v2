from __future__ import annotations

import json

from app.generation import parse_llama_sse_data
from app.sse import event, heartbeat


def test_parse_llama_openai_compatible_delta_and_finish() -> None:
    token = parse_llama_sse_data('{"choices":[{"delta":{"content":"안녕"},"finish_reason":null}]}')
    assert token is not None and token.content == "안녕"
    done = parse_llama_sse_data('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
    assert done is not None and done.finish_reason == "stop"
    assert parse_llama_sse_data("[DONE]") is None


def test_sse_data_is_single_line_json_and_heartbeat_is_comment() -> None:
    frame = event("token", {"delta": "첫 줄\n둘째 줄"}).decode()
    assert frame.startswith("event: token\ndata: ")
    data_line = frame.splitlines()[1].removeprefix("data: ")
    assert json.loads(data_line) == {"delta": "첫 줄\n둘째 줄"}
    assert heartbeat() == b": heartbeat\n\n"
