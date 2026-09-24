"""Async HTTP executor. Bounded concurrency, timeouts, redirects OFF.

Every request is routed through the SafetyGuard so budget, deadline and the
circuit breaker apply uniformly.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import httpx

from ..config import settings
from .guard import SafetyGuard


@dataclass
class ExecutionResult:
    status: int
    headers: Dict[str, str]
    body: Any
    latency_ms: float
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


class HttpExecutor:
    def __init__(self, guard: SafetyGuard, concurrency: int | None = None):
        self.guard = guard
        self._sem_size = concurrency or settings.MAX_CONCURRENT
        self._client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=settings.REQUEST_TIMEOUT_SECONDS,
        )
        import asyncio
        self._sem = asyncio.Semaphore(self._sem_size)

    async def execute(self, method: str, url: str,
                      headers: Optional[Dict[str, str]] = None,
                      json_body: Optional[Any] = None) -> ExecutionResult:
        self.guard.check_budget()
        async with self._sem:
            start = time.perf_counter()
            try:
                resp = await self._client.request(method.upper(), url,
                                                  headers=headers or {}, json=json_body)
                latency = (time.perf_counter() - start) * 1000
                try:
                    body = resp.json()
                except Exception:
                    body = resp.text
                result = ExecutionResult(
                    status=resp.status_code,
                    headers={k: v for k, v in resp.headers.items()},
                    body=body,
                    latency_ms=latency,
                )
            except (httpx.TimeoutException, httpx.RequestError) as exc:
                latency = (time.perf_counter() - start) * 1000
                result = ExecutionResult(status=0, headers={}, body=None,
                                         latency_ms=latency, error=str(exc))

        # The circuit breaker protects the TARGET from a failing scan. A 4xx
        # (e.g. 401/403 auth denial) is a valid, healthy response — only a
        # transport failure or a 5xx counts as the target being in trouble.
        healthy = result.status != 0 and result.status < 500
        self.guard.record_request(healthy, result.latency_ms)
        self.guard.check_circuit_breaker()
        return result

    async def close(self) -> None:
        await self._client.aclose()
