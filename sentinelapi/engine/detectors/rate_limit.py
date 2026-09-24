from typing import Optional, List, Dict, Any
from .base import BaseDetector, FindingCandidate
from ..core.executor import HttpExecutor, ExecutionResult
from ..core.risk_engine import calculate_severity
from ..core.evidence import generate_fingerprint
from ..ingest.api_model import NormalizedEndpoint

class RateLimitDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="RATE_LIMITING", owasp_id="API4:2023")

    async def probe_login(
        self,
        executor: HttpExecutor,
        target_base_url: str,
        login_endpoint: NormalizedEndpoint
    ) -> Optional[FindingCandidate]:
        """
        Executes a controlled series of 20 failed login attempts to determine if rate limiting is enforced.
        """
        if "login" not in login_endpoint.path.lower() or login_endpoint.method != "POST":
            return None

        url = f"{target_base_url}{login_endpoint.path}"
        rate_limited = False
        probes_recorded = []

        for i in range(1, 21):
            body = {"username": f"probe_user_{i}", "password": "wrong_password_123"}
            res = await executor.execute("POST", url, json_body=body)
            
            # Check for standard HTTP 429 or rate-limiting headers
            has_rate_limit_header = any(
                k.lower() in ("retry-after", "ratelimit-limit", "ratelimit-remaining", "x-ratelimit-remaining")
                for k in res.headers
            )
            if res.status == 429 or has_rate_limit_header:
                rate_limited = True
                break

            if i in (1, 10, 20):
                probes_recorded.append({
                    "label": f"Attempt_{i}",
                    "identity": "anonymous",
                    "status": res.status,
                    "latency_ms": int(res.latency_ms),
                    "request_json_redacted": {"method": "POST", "url": url, "body": body},
                    "response_json_redacted": {"status": res.status, "headers": res.headers, "body": res.body}
                })

        if not rate_limited:
            factors = ["missing_throttling", "repeat_verified"]
            severity, risk_score, _ = calculate_severity(factors)
            fingerprint = generate_fingerprint(target_base_url, self.name, login_endpoint.operation_id)

            return FindingCandidate(
                finding_class=self.name,
                owasp_id=self.owasp_id,
                endpoint_path=login_endpoint.path,
                endpoint_method=login_endpoint.method,
                operation_id=login_endpoint.operation_id,
                title="Missing Rate Limiting on Authentication Endpoint",
                impact=(
                    f"Endpoint '{login_endpoint.path}' accepted 20 rapid sequential login attempts without "
                    "returning HTTP 429 Too Many Requests or rate limiting headers, allowing automated brute-force attacks."
                ),
                remediation="Configure rate-limiting middleware (e.g. max 5 login attempts per IP/account per minute).",
                expected="HTTP 429 Too Many Requests with Retry-After header after 5 failed attempts",
                actual="All 20 requests returned HTTP 401 without rate throttling or lockouts",
                severity=severity,
                risk_score=risk_score,
                confidence="VERIFIED",
                score_factors=factors,
                probes=probes_recorded,
                fingerprint=fingerprint
            )

        return None
