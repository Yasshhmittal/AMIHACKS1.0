"""Security misconfiguration-lite (OWASP API8:2023).

Checks security headers, reflected-CORS-with-credentials, exposed debug/config
endpoints, and version disclosure. On localhost, TLS/HSTS gaps are INFO, not
findings (environment scoping).
"""
from __future__ import annotations

from typing import List
from urllib.parse import urlparse

from ..core.evidence import generate_fingerprint
from ..core.executor import HttpExecutor
from ..core.risk_engine import calculate_severity
from ..ingest.api_model import NormalizedEndpoint
from .base import BaseDetector, FindingCandidate

DEBUG_PATHS = ["/debug/config", "/debug", "/.env", "/actuator", "/actuator/env"]


class MisconfigDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="MISCONFIGURATION", owasp_id="API8:2023")

    def _is_local(self, base_url: str) -> bool:
        host = urlparse(base_url).hostname or ""
        return host in ("localhost", "127.0.0.1", "::1", "sentinelshop", "sentinel")

    async def probe(self, executor: HttpExecutor, base_url: str) -> List[FindingCandidate]:
        findings: List[FindingCandidate] = []
        local = self._is_local(base_url)

        # 1) exposed debug/config endpoints
        for path in DEBUG_PATHS:
            url = f"{base_url}{path}"
            res = await executor.execute("GET", url)
            if res.ok:
                probes = []
                self.record_probe(probes, "P1", "anonymous", "GET", url, {}, res)
                factors = ["hardening_gap"]
                sev, risk, sf = calculate_severity(factors)
                findings.append(FindingCandidate(
                    finding_class=self.name, owasp_id=self.owasp_id,
                    endpoint_path=path, endpoint_method="GET", operation_id=None,
                    title=f"Debug/config endpoint exposed: {path}",
                    impact=f"{path} is reachable without authentication and may leak internal configuration or secrets.",
                    remediation="Remove or gate debug endpoints behind authentication and disable them in non-dev environments.",
                    expected=f"HTTP 404 for {path} in a hardened deployment",
                    actual=f"HTTP {res.status} returning configuration data",
                    severity=sev, risk_score=risk, confidence="VERIFIED",
                    score_factors=sf, probes=probes,
                    fingerprint=generate_fingerprint(base_url, self.name, path, None, "anonymous"),
                    vuln_id="V7"))
                break  # one debug finding is enough

        # 2) security headers + reflected CORS (probe with a hostile Origin)
        url = f"{base_url}/health"
        evil_origin = "https://evil.example.com"
        res = await executor.execute("GET", url, headers={"Origin": evil_origin})
        hset = {k.lower(): v for k, v in res.headers.items()}
        missing = [h for h in ("x-content-type-options", "x-frame-options") if h not in hset]
        if not local:
            if "strict-transport-security" not in hset:
                missing.append("strict-transport-security")
        cors_reflect = hset.get("access-control-allow-origin") == evil_origin and \
            hset.get("access-control-allow-credentials", "").lower() == "true"
        version_leak = "server" in hset or "x-powered-by" in hset

        if missing or cors_reflect or version_leak:
            probes = []
            self.record_probe(probes, "P1", "anonymous", "GET", url, {"Origin": evil_origin}, res)
            bits = []
            if missing:
                bits.append("missing headers: " + ", ".join(missing))
            if cors_reflect:
                bits.append("CORS reflects arbitrary Origin with credentials")
            if version_leak:
                bits.append(f"version disclosure ({hset.get('server') or hset.get('x-powered-by')})")
            factors = ["hardening_gap"]
            sev, risk, sf = calculate_severity(factors)
            findings.append(FindingCandidate(
                finding_class=self.name, owasp_id=self.owasp_id,
                endpoint_path="/", endpoint_method="GET", operation_id=None,
                title="Security misconfiguration (headers / CORS / version disclosure)",
                impact="; ".join(bits) + ". These weaken defence-in-depth and enable cross-origin credential theft.",
                remediation=("Add X-Content-Type-Options, X-Frame-Options and HSTS; restrict CORS to an allowlist "
                             "and never reflect an arbitrary Origin with credentials; suppress Server/X-Powered-By."),
                expected="Hardening headers present; CORS restricted; no version banners",
                actual="; ".join(bits),
                severity=sev, risk_score=risk, confidence="VERIFIED",
                score_factors=sf, probes=probes,
                fingerprint=generate_fingerprint(base_url, self.name, "headers", None, "anonymous"),
                vuln_id="V7"))
        return findings
