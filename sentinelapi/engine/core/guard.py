"""Safety guard: the engine's conscience. Enforced before any socket opens.

Every control here is a demo talking point and a real safeguard:
  * target allowlist (sandbox / private ranges only, unless explicitly overridden)
  * request budget + wall-clock deadline
  * circuit breaker (abort on high error rate or latency blow-up)
"""
from __future__ import annotations

import ipaddress
import socket
import time
from urllib.parse import urlparse

from ..config import settings


class GuardViolation(Exception):
    """Raised when a request would break a safety rule. Aborts the scan."""


class BudgetExhausted(GuardViolation):
    pass


class CircuitBreakerTripped(GuardViolation):
    pass


_ALLOWED_HOSTNAMES = {"localhost", "sentinelshop", "sentinel", "127.0.0.1", "::1"}


def _host_is_private(host: str) -> bool:
    if host in _ALLOWED_HOSTNAMES:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback
    except ValueError:
        # Not a literal IP — resolve it. Any resolved address must be private.
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror:
            return False
        for info in infos:
            addr = info[4][0]
            try:
                if not (ipaddress.ip_address(addr).is_private or ipaddress.ip_address(addr).is_loopback):
                    return False
            except ValueError:
                return False
        return True


class SafetyGuard:
    def __init__(self, target_base_url: str,
                 max_requests: int | None = None,
                 deadline_seconds: int | None = None):
        self.target_base_url = target_base_url
        self.max_requests = max_requests or settings.MAX_REQUESTS
        self.deadline_seconds = deadline_seconds or settings.SCAN_DEADLINE_SECONDS

        self.request_count = 0
        self.error_count = 0
        self.latencies: list[float] = []
        self.baseline_latency: float | None = None
        self.started_at = time.perf_counter()
        self.aborted_reason: str | None = None

        self._assert_target_allowed()

    # ---- allowlist ----
    def _assert_target_allowed(self) -> None:
        host = urlparse(self.target_base_url).hostname or ""
        if settings.allow_public:
            return
        if not _host_is_private(host):
            raise GuardViolation(
                f"Refusing to scan '{host}': not a sandbox/private target. "
                f"Set SENTINEL_ALLOW_PUBLIC=1 to override (only with authorization)."
            )

    # ---- budget + deadline ----
    def check_budget(self) -> None:
        if self.request_count >= self.max_requests:
            self.aborted_reason = "budget_exhausted"
            raise BudgetExhausted(f"Request budget of {self.max_requests} exhausted.")
        if time.perf_counter() - self.started_at > self.deadline_seconds:
            self.aborted_reason = "deadline_exceeded"
            raise BudgetExhausted(f"Scan deadline of {self.deadline_seconds}s exceeded.")

    def record_request(self, ok: bool, latency_ms: float) -> None:
        self.request_count += 1
        self.latencies.append(latency_ms)
        if not ok:
            self.error_count += 1
        if self.baseline_latency is None and ok:
            self.baseline_latency = latency_ms

    # ---- circuit breaker ----
    def check_circuit_breaker(self) -> None:
        # Only start judging once we have a meaningful sample, so a couple of
        # early transport blips don't abort a short scan.
        if self.request_count < 15:
            return
        error_rate = self.error_count / max(self.request_count, 1)
        if error_rate > settings.CIRCUIT_BREAKER_ERROR_THRESHOLD:
            self.aborted_reason = "circuit_breaker_error_rate"
            raise CircuitBreakerTripped(
                f"Error rate {error_rate:.0%} exceeded {settings.CIRCUIT_BREAKER_ERROR_THRESHOLD:.0%}; aborting to protect target."
            )
        if self.baseline_latency and self.latencies:
            recent = sum(self.latencies[-5:]) / len(self.latencies[-5:])
            if recent > self.baseline_latency * settings.CIRCUIT_BREAKER_LATENCY_MULTIPLIER:
                self.aborted_reason = "circuit_breaker_latency"
                raise CircuitBreakerTripped(
                    f"Latency tripled vs baseline ({recent:.0f}ms vs {self.baseline_latency:.0f}ms); aborting."
                )
