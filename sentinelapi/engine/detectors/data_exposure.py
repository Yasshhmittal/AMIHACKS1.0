"""Excessive Data Exposure (OWASP API3:2023).

A 2xx JSON body contains a field that is undocumented in the response schema OR
matches a sensitive name/value pattern.
"""
from __future__ import annotations

from typing import Optional

from ..core.comparator import (find_sensitive_fields, undocumented_fields,
                               unwrap_envelope)
from ..core.evidence import generate_fingerprint
from ..core.executor import ExecutionResult, HttpExecutor
from ..core.risk_engine import calculate_severity
from ..core.session import IdentitySession
from ..ingest.api_model import NormalizedEndpoint
from .base import BaseDetector, FindingCandidate

CREDENTIAL_MARKERS = ("passwordhash", "password", "_hash", "secret", "token", "apikey", "privatekey")


class ExcessiveDataExposureDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="EXCESSIVE_DATA_EXPOSURE", owasp_id="API3:2023")

    async def analyze_response(self, executor: HttpExecutor, base_url: str,
                               endpoint: NormalizedEndpoint, identity: IdentitySession,
                               res: ExecutionResult) -> Optional[FindingCandidate]:
        if not res.ok:
            return None
        sensitive = find_sensitive_fields(res.body)
        undoc = undocumented_fields(unwrap_envelope(res.body), endpoint.documented_response_fields) \
            if endpoint.documented_response_fields else []
        if not sensitive and not undoc:
            return None

        url = f"{base_url}{endpoint.path}"
        probes: list[dict] = []
        self.record_probe(probes, "P1", identity.label, endpoint.method, url, identity.get_auth_headers(), res)

        factors = ["sensitive_field_names"] if sensitive else ["undocumented_only"]
        has_credential = any(any(mk in s.lower() for mk in CREDENTIAL_MARKERS) for s in sensitive)
        if has_credential:
            factors.append("credential_material")
        if undoc and sensitive:
            factors.append("undocumented_only")

        severity, risk, score_factors = calculate_severity(factors)
        confidence = "VERIFIED" if sensitive else "POTENTIAL"
        # Exposure is a property of the endpoint, not the caller — role-independent
        # fingerprint so the same leak isn't reported once per identity.
        fp = generate_fingerprint(base_url, self.name, endpoint.operation_id,
                                  ",".join(sensitive[:3]) or "undoc", "*")

        leaked = ", ".join(sorted(set(s.split(".")[-1] for s in (sensitive or undoc)))[:6])
        return FindingCandidate(
            finding_class=self.name, owasp_id=self.owasp_id,
            endpoint_path=endpoint.path, endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Excessive Data Exposure on {endpoint.path}",
            impact=(f"The response exposes fields the client should not receive: {leaked}. "
                    + ("Credential/cryptographic material is among them. " if has_credential else "")
                    + "These are returned to any caller who can reach the endpoint."),
            remediation=("Return an explicit response DTO containing only the documented fields. "
                         "Never serialize the internal model directly."),
            expected="Response limited to documented, non-sensitive fields",
            actual=f"Response includes sensitive/undocumented fields: {leaked}",
            severity=severity, risk_score=risk, confidence=confidence,
            score_factors=score_factors, probes=probes, fingerprint=fp, vuln_id="V4",
        )
