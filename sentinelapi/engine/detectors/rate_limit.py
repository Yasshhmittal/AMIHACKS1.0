"""Missing rate limiting on authentication (OWASP API4:2023).

Sends a bounded burst of failed logins with distinct usernames and checks that
none are throttled (no 429, no Retry-After / RateLimit-* headers).
"""
from __future__ import annotations

from typing import Optional

from ..core.evidence import generate_fingerprint
from ..core.executor import HttpExecutor
from ..core.risk_engine import calculate_severity
from ..ingest.api_model import NormalizedEndpoint
from .base import BaseDetector, FindingCandidate

BURST = 20
RL_HEADERS = ("retry-after", "ratelimit-limit", "ratelimit-remaining", "x-ratelimit-limit")


class RateLimitDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="RATE_LIMITING", owasp_id="API4:2023")

    async def probe_login(self, executor: HttpExecutor, base_url: str,
                          endpoint: NormalizedEndpoint) -> Optional[FindingCandidate]:
        url = f"{base_url}{endpoint.path}"
        probes: list[dict] = []
        throttled = False
        last = None

        for i in range(BURST):
            body = {"username": f"probe_user_{i}", "password": "definitely-wrong"}
            res = await executor.execute("POST", url, json_body=body)
            last = res
            if res.status == 429 or any(h in {k.lower() for k in res.headers} for h in RL_HEADERS):
                throttled = True
                if i < 3:
                    # throttled almost immediately -> effectively protected
                    self.record_probe(probes, f"P{i+1}", "anonymous", "POST", url, {}, res)
                    return None
                break
            if i in (0, BURST - 1):
                self.record_probe(probes, "P1" if i == 0 else "P2", "anonymous", "POST", url, {}, res)

        if throttled:
            return None

        factors = ["auth_no_throttle", "exploitable_anon"]
        severity, risk, score_factors = calculate_severity(factors)
        fp = generate_fingerprint(base_url, self.name, endpoint.operation_id, None, "anonymous")

        return FindingCandidate(
            finding_class=self.name, owasp_id=self.owasp_id,
            endpoint_path=endpoint.path, endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Missing Rate Limiting on {endpoint.path}",
            impact=(f"{BURST} sequential failed logins were accepted with no throttling, lockout, or "
                    "rate-limit headers. This enables credential-stuffing and brute-force attacks."),
            remediation="Add per-IP and per-account rate limiting with lockout/backoff on the auth endpoint.",
            expected="HTTP 429 or RateLimit-* headers after a burst of failed logins",
            actual=f"All {BURST} attempts returned {last.status if last else 'n/a'} with no throttling",
            severity=severity, risk_score=risk, confidence="VERIFIED",
            score_factors=score_factors, probes=probes, fingerprint=fp, vuln_id="V6",
        )
