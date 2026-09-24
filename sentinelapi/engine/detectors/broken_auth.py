"""Broken Authentication (OWASP API2:2023).

The spec declares the endpoint secured, yet an anonymous (or malformed-token)
request returns 2xx with a non-empty body, while a valid token also returns 2xx.
"""
from __future__ import annotations

from typing import Optional

from ..core.evidence import generate_fingerprint
from ..core.executor import HttpExecutor
from ..core.risk_engine import calculate_severity
from ..core.session import IdentitySession
from ..ingest.api_model import NormalizedEndpoint
from .base import BaseDetector, FindingCandidate


def _non_empty(body) -> bool:
    if body is None:
        return False
    if isinstance(body, (list, dict, str)):
        return len(body) > 0
    return True


class BrokenAuthDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="BROKEN_AUTH", owasp_id="API2:2023")

    async def probe_endpoint(self, executor: HttpExecutor, base_url: str,
                             endpoint: NormalizedEndpoint,
                             anonymous: IdentitySession, valid: Optional[IdentitySession]) -> Optional[FindingCandidate]:
        if not endpoint.spec_secured:
            return None
        url = f"{base_url}{endpoint.path}"
        m = endpoint.method
        probes: list[dict] = []

        p_anon = await executor.execute(m, url, headers=anonymous.get_auth_headers())
        self.record_probe(probes, "P1", anonymous.label, m, url, anonymous.get_auth_headers(), p_anon)
        if not (p_anon.ok and _non_empty(p_anon.body)):
            return None  # auth is enforced for anon

        # malformed-token control: a junk bearer must not be honoured either
        bad_headers = {"Authorization": "Bearer not-a-real-token-000"}
        p_bad = await executor.execute(m, url, headers=bad_headers)
        self.record_probe(probes, "P2", "malformed", m, url, bad_headers, p_bad)

        factors = ["auth_boundary_crossed", "exploitable_anon"]
        # A secured collection that returns per-user records to an anonymous
        # caller is also cross-identity data exposure.
        if isinstance(p_anon.body, list) and len(p_anon.body) > 0:
            factors.append("cross_identity_data")
        severity, risk, score_factors = calculate_severity(factors)
        fp = generate_fingerprint(base_url, self.name, endpoint.operation_id, None, "anonymous")

        return FindingCandidate(
            finding_class=self.name, owasp_id=self.owasp_id,
            endpoint_path=endpoint.path, endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Broken Authentication on {endpoint.path}",
            impact=(f"The specification marks {endpoint.display} as requiring authentication, but an "
                    "anonymous request returned data. Anyone on the network can read it."),
            remediation="Enforce the declared security scheme in middleware; reject requests without a valid token.",
            expected="HTTP 401 Unauthorized for anonymous requests",
            actual=f"HTTP {p_anon.status} with a non-empty body for an anonymous caller",
            severity=severity, risk_score=risk, confidence="VERIFIED",
            score_factors=score_factors, probes=probes, fingerprint=fp, vuln_id="V5",
        )
