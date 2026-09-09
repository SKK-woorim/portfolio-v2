from __future__ import annotations


def service_api_headers(api_key: str, *, json_content: bool = False) -> dict[str, str]:
    """Build PostgREST headers for new secret keys and legacy service-role JWTs."""
    headers = {"apikey": api_key}
    if not api_key.startswith("sb_secret_"):
        headers["authorization"] = f"Bearer {api_key}"
    if json_content:
        headers["content-type"] = "application/json"
    return headers
