from __future__ import annotations

from uuid import uuid4

import pytest

from app.security import (
    AuthenticationError,
    HmacVerifier,
    ReplayCache,
    ReplayError,
    SignedHeaders,
    create_signature,
)


@pytest.mark.asyncio
async def test_hmac_verifies_raw_body_and_rejects_replay() -> None:
    secret = "a-secure-shared-secret"
    now = 1_800_000_000
    timestamp = str(now)
    request_id = str(uuid4())
    body = b'{"message":"\xec\\u00a7"}'
    signature = create_signature(secret, timestamp, request_id, body)
    verifier = HmacVerifier(secret, ReplayCache(ttl_seconds=300), 60)

    assert (
        str(await verifier.verify(SignedHeaders(timestamp, request_id, signature), body, now=now))
        == request_id
    )
    with pytest.raises(ReplayError):
        await verifier.verify(SignedHeaders(timestamp, request_id, signature), body, now=now + 1)


@pytest.mark.asyncio
async def test_hmac_rejects_expired_bad_signature_without_poisoning_cache() -> None:
    secret = "a-secure-shared-secret"
    now = 1_800_000_000
    timestamp = str(now)
    request_id = str(uuid4())
    body = b"{}"
    verifier = HmacVerifier(secret, ReplayCache(), 60)

    with pytest.raises(AuthenticationError, match="expired"):
        await verifier.verify(
            SignedHeaders(
                str(now - 61), request_id, create_signature(secret, str(now - 61), request_id, body)
            ),
            body,
            now=now,
        )
    with pytest.raises(AuthenticationError, match="signature"):
        await verifier.verify(SignedHeaders(timestamp, request_id, "0" * 64), body, now=now)

    valid = create_signature(secret, timestamp, request_id, body)
    await verifier.verify(SignedHeaders(timestamp, request_id, valid), body, now=now)


@pytest.mark.asyncio
async def test_signature_is_bound_to_body_timestamp_and_request_id() -> None:
    secret = "a-secure-shared-secret"
    now = 1_800_000_000
    timestamp = str(now)
    request_id = str(uuid4())
    signature = create_signature(secret, timestamp, request_id, b"one")
    verifier = HmacVerifier(secret, ReplayCache(), 60)
    with pytest.raises(AuthenticationError):
        await verifier.verify(SignedHeaders(timestamp, request_id, signature), b"two", now=now)
