import asyncio
import time
import httpx
from typing import Any, Dict, Optional
from ..config import settings
from .guard import SafetyGuard, GuardViolation

class ExecutionResult:
    def __init__(self, status: int, headers: Dict[str, str], body: Any, latency_ms: float, error: Optional[str] = None):
        self.status = status
        self.headers = headers
        self.body = body
        self.latency_ms = latency_ms
        self.error = error

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

class HttpExecutor:
    def __init__(self, guard: SafetyGuard, max_concurrency: int = 5):
        self.guard = guard
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self.client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=settings.REQUEST_TIMEOUT_SECONDS,
            verify=False
        )

    async def close(self):
        await self.client.aclose()

    async def execute(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        json_body: Optional[Any] = None
    ) -> ExecutionResult:
        """
        Executes a guarded, concurrency-bounded HTTP request.
        """
        self.guard.before_request()

        merged_headers = headers.copy() if headers else {}
        if "User-Agent" not in merged_headers:
            merged_headers["User-Agent"] = "SentinelAPI-ZeroTrustScanner/1.0"

        async with self.semaphore:
            start = time.perf_counter()
            status_code = 0
            res_headers = {}
            body_data = None
            error_msg = None

            try:
                res = await self.client.request(
                    method=method.upper(),
                    url=url,
                    headers=merged_headers,
                    json=json_body
                )
                latency = (time.perf_counter() - start) * 1000.0
                status_code = res.status_code
                res_headers = dict(res.headers)

                try:
                    body_data = res.json()
                except Exception:
                    body_data = res.text

            except httpx.TimeoutException:
                latency = (time.perf_counter() - start) * 1000.0
                error_msg = "Request timed out"
            except httpx.ConnectError:
                latency = (time.perf_counter() - start) * 1000.0
                error_msg = "Connection failed / refused"
            except Exception as e:
                latency = (time.perf_counter() - start) * 1000.0
                error_msg = str(e)

            self.guard.record_response(status_code, latency)

            return ExecutionResult(
                status=status_code,
                headers=res_headers,
                body=body_data,
                latency_ms=latency,
                error=error_msg
            )
