"""BFLA — Broken Function Level Authorization (OWASP API5:2023).

A low-privilege identity gets 2xx on an admin-scoped endpoint, while the admin
control also returns 2xx and anonymous is denied.
"""
from __future__ import annotations

from typing import Optional

from ..core.evidence import generate_fingerprint
from ..core.executor import HttpExecutor
from ..core.risk_engine import calculate_severity
from ..core.session import IdentitySession
from ..ingest.api_model import NormalizedEndpoint
from .base import BaseDetector, FindingCandidate


class BflaDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="BFLA", owasp_id="API5:2023")

    async def probe_endpoint(self, executor: HttpExecutor, base_url: str,
                             endpoint: NormalizedEndpoint,
                             low_priv: IdentitySession, admin: IdentitySession,
                             anonymous: IdentitySession) -> Optional[FindingCandidate]:
        url = f"{base_url}{endpoint.path}"
        m = endpoint.method
        probes: list[dict] = []

        p_admin = await executor.execute(m, url, headers=admin.get_auth_headers())
        self.record_probe(probes, "P1", admin.label, m, url, admin.get_auth_headers(), p_admin)
        if not p_admin.ok:
            return None  # endpoint not working even for admin; inconclusive

        p_low = await executor.execute(m, url, headers=low_priv.get_auth_headers())
        self.record_probe(probes, "P2", low_priv.label, m, url, low_priv.get_auth_headers(), p_low)
        if not p_low.ok:
            return None  # correctly denied to low-priv

        p_anon = await executor.execute(m, url, headers=anonymous.get_auth_headers())
        self.record_probe(probes, "P3", anonymous.label, m, url, anonymous.get_auth_headers(), p_anon)

        factors = ["admin_reachable_low_priv", "exploitable_low_priv", "auth_boundary_crossed"]
        confidence = "VERIFIED"
        severity, risk, score_factors = calculate_severity(factors)
        fp = generate_fingerprint(base_url, self.name, endpoint.operation_id, None, low_priv.role)

        return FindingCandidate(
            finding_class=self.name, owasp_id=self.owasp_id,
            endpoint_path=endpoint.path, endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Broken Function Level Authorization on {endpoint.path}",
            impact=(f"Low-privilege user '{low_priv.label}' invoked the admin-scoped function "
                    f"{endpoint.display} and received a success response. Administrative "
                    "capability is exposed to non-admins."),
            remediation=("Enforce a role check on this endpoint (e.g. require role == 'admin') "
                         "before executing the handler, not merely in the UI."),
            expected=f"HTTP 403 Forbidden for low-privilege user on {endpoint.display}",
            actual=f"HTTP {p_low.status} success for '{low_priv.label}' on admin endpoint",
            severity=severity, risk_score=risk, confidence=confidence,
            score_factors=score_factors, probes=probes, fingerprint=fp, vuln_id="V3",
        )
