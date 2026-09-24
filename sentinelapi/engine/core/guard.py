import ipaddress
import time
import urllib.parse
from typing import List, Optional
from ..config import settings

class GuardViolation(Exception):
    """Raised when safety controls or circuit breakers are breached."""
    pass

class SafetyGuard:
    def __init__(self, target_base_url: str, max_requests: int = 500, deadline_seconds: int = 300):
        self.target_base_url = target_base_url
        self.max_requests = max_requests
        self.deadline_seconds = deadline_seconds
        
        self.start_time = time.time()
        self.request_count = 0
        self.error_count = 0
        self.latencies: List[float] = []
        self.initial_avg_latency: Optional[float] = None
        
        # Validate target host on initialization
        self.validate_target_host(target_base_url)

    @staticmethod
    def is_allowlisted_host(host: str) -> bool:
        """
        Safety axiom: Never scan arbitrary third-party infrastructure without explicit authorization.
        Permits localhost, 127.0.0.1, Docker service names, and RFC1918 private subnets.
        """
        allowed_names = {"localhost", "127.0.0.1", "sentinelshop", "sentinel", "0.0.0.0", "::1"}
        if host.lower() in allowed_names:
            return True
            
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_loopback or ip.is_private or ip.is_link_local:
                return True
        except ValueError:
            pass

        return settings.SENTINEL_ALLOW_PUBLIC == "1"

    def validate_target_host(self, url: str):
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname
        if not host:
            raise GuardViolation(f"Invalid target URL: {url} (missing hostname)")
        if not self.is_allowlisted_host(host):
            raise GuardViolation(
                f"Target host '{host}' is outside the authorized allowlist. "
                "SentinelAPI only probes localhost/sandbox targets unless SENTINEL_ALLOW_PUBLIC=1."
            )

    def before_request(self):
        """Pre-request checks: budget and deadline."""
        if self.request_count >= self.max_requests:
            raise GuardViolation(f"Request budget exhausted: {self.request_count}/{self.max_requests} requests executed.")
            
        elapsed = time.time() - self.start_time
        if elapsed > self.deadline_seconds:
            raise GuardViolation(f"Scan wall-clock deadline exceeded ({elapsed:.1f}s > {self.deadline_seconds}s).")

    def record_response(self, status_code: int, latency_ms: float):
        """Post-request telemetry & circuit breaker logic."""
        self.request_count += 1
        self.latencies.append(latency_ms)
        
        # Count 5xx or connection drops as errors
        if status_code >= 500 or status_code == 0:
            self.error_count += 1

        # Evaluate Circuit Breaker after at least 10 requests
        if self.request_count >= 10:
            # Check 1: Error rate > 30%
            error_rate = self.error_count / self.request_count
            if error_rate > settings.CIRCUIT_BREAKER_ERROR_THRESHOLD:
                raise GuardViolation(
                    f"Circuit Breaker tripped! Target error rate {error_rate:.1%} exceeds threshold "
                    f"({settings.CIRCUIT_BREAKER_ERROR_THRESHOLD:.0%}). Aborting scan to protect target system."
                )

            # Check 2: Latency tripling
            if len(self.latencies) == 10:
                self.initial_avg_latency = sum(self.latencies) / 10.0
            elif self.initial_avg_latency and self.initial_avg_latency > 0:
                recent_avg = sum(self.latencies[-10:]) / 10.0
                if recent_avg > (self.initial_avg_latency * settings.CIRCUIT_BREAKER_LATENCY_MULTIPLIER):
                    raise GuardViolation(
                        f"Circuit Breaker tripped! Target latency tripled from {self.initial_avg_latency:.1f}ms "
                        f"to {recent_avg:.1f}ms. Target server may be saturating."
                    )
