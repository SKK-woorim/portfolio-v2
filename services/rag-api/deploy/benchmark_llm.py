"""Measure an idle llama-server using synthetic inputs; never sends private data."""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--label", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prompt-tokens", type=int, nargs="+", default=[128, 768])
    parser.add_argument("--predict", type=int, default=32)
    parser.add_argument("--repeats", type=int, default=2)
    args = parser.parse_args()
    if min(*args.prompt_tokens, args.predict, args.repeats) <= 0:
        parser.error("token counts and repeats must be positive")

    def request(path: str, body: dict | None = None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            args.base_url.rstrip("/") + path,
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=300) as response:
            return json.load(response)

    if any(slot["is_processing"] for slot in request("/slots")):
        raise SystemExit("Server is busy; benchmark cancelled.")
    props = request("/props")
    text = "The server uses two ARM CPU cores. Explain how caching reduces repeated work. "
    text *= max(args.prompt_tokens)
    tokens = request("/tokenize", {"content": text, "add_special": True})["tokens"]
    context = props["default_generation_settings"]["n_ctx"]
    if max(args.prompt_tokens) + args.predict > context:
        parser.error("prompt plus generation exceeds server context")
    request("/completion", {"prompt": "Hello", "n_predict": 8, "temperature": 0, "cache_prompt": False})
    with args.output.open("a", encoding="utf-8") as output:
        for repeat in range(args.repeats):
            for size in args.prompt_tokens:
                start = time.monotonic()
                result = request("/completion", {
                    "prompt": tokens[:size], "n_predict": args.predict,
                    "temperature": 0, "seed": 42, "cache_prompt": False,
                    "ignore_eos": True, "return_tokens": True,
                })
                row = {
                    "config": args.label, "repeat": repeat, "input_tokens": size,
                    "build": props.get("build_info"), "model": props.get("model_path"),
                    "wall_seconds": time.monotonic() - start,
                    "timings": result["timings"], "tokens": result.get("tokens"),
                    "content": result.get("content"),
                }
                output.write(json.dumps(row, ensure_ascii=False) + "\n")
                output.flush()
                print(json.dumps(row, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
