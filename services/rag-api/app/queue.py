from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass


class ModelBusyError(RuntimeError):
    pass


@dataclass(frozen=True)
class QueueSnapshot:
    running: int
    waiting: int
    max_waiters: int


class GenerationGate:
    """FIFO generation gate with exactly one runner and bounded waiting."""

    def __init__(self, max_waiters: int = 5) -> None:
        self.max_waiters = max_waiters
        self._running = False
        self._waiters: deque[asyncio.Future[None]] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        future: asyncio.Future[None] | None = None
        async with self._lock:
            if not self._running:
                self._running = True
                return
            self._remove_cancelled_locked()
            if len(self._waiters) >= self.max_waiters:
                raise ModelBusyError("generation queue is full")
            future = asyncio.get_running_loop().create_future()
            self._waiters.append(future)

        try:
            await future
        except BaseException:
            acquired = False
            async with self._lock:
                try:
                    self._waiters.remove(future)
                except ValueError:
                    acquired = future.done() and not future.cancelled()
            if acquired:
                await self.release()
            raise

    async def release(self) -> None:
        async with self._lock:
            self._remove_cancelled_locked()
            if self._waiters:
                waiter = self._waiters.popleft()
                if not waiter.done():
                    waiter.set_result(None)
                return
            self._running = False

    async def snapshot(self) -> QueueSnapshot:
        async with self._lock:
            self._remove_cancelled_locked()
            return QueueSnapshot(int(self._running), len(self._waiters), self.max_waiters)

    def _remove_cancelled_locked(self) -> None:
        self._waiters = deque(waiter for waiter in self._waiters if not waiter.cancelled())

    @asynccontextmanager
    async def lease(self) -> AsyncIterator[None]:
        await self.acquire()
        try:
            yield
        finally:
            await self.release()
