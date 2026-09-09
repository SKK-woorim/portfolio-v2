from __future__ import annotations

import asyncio

import pytest

from app.queue import GenerationGate, ModelBusyError


@pytest.mark.asyncio
async def test_generation_gate_allows_one_running_and_five_waiting() -> None:
    gate = GenerationGate(max_waiters=5)
    await gate.acquire()
    waiters = [asyncio.create_task(gate.acquire()) for _ in range(5)]
    await asyncio.sleep(0)
    assert (await gate.snapshot()).waiting == 5

    with pytest.raises(ModelBusyError):
        await gate.acquire()

    for waiter in waiters:
        await gate.release()
        await waiter
    await gate.release()
    assert (await gate.snapshot()).running == 0


@pytest.mark.asyncio
async def test_cancelled_waiter_is_removed_and_next_request_runs() -> None:
    gate = GenerationGate(max_waiters=1)
    await gate.acquire()
    waiter = asyncio.create_task(gate.acquire())
    await asyncio.sleep(0)
    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter
    replacement = asyncio.create_task(gate.acquire())
    await asyncio.sleep(0)
    await gate.release()
    await replacement
    await gate.release()
    assert (await gate.snapshot()).waiting == 0
