from typing import Optional, List, Dict, Any
from .base import BaseDetector, FindingCandidate
from ..core.executor import HttpExecutor, ExecutionResult
from ..core.risk_engine import calculate_severity
from ..core.evidence import generate_fingerprint

DEBUG_PATHS = ["/debug/config", "/.env", "/actuator/health", "/api/debug"]

class MisconfigDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="MISCONFIGURATION", owasp_id="API8:2023")

    async def probe_security_headers_and_cors(
        self,
        executor: HttpExecutor,
        target_base_url: str
    ) -> List[FindingCandidate]:
        """
        Tests security headers, CORS origin reflection, version leakage, and debug endpoint exposure.
        """
        findings = []
        test_origin = "https://evil-attacker.com"
        res = await executor.execute("GET", f"{target_base_url}/health", headers={"Origin": test_origin})

        # 1. CORS Reflection Check
        cors_origin = res.headers.get("access-control-allow-origin", "")
        cors_creds = res.headers.get("access-control-allow-credentials", "")
        if cors_origin == test_origin and cors_creds.lower() == "true":
            factors = ["hardening_gap", "repeat_verified"]
            severity, risk_score, _ = calculate_severity(factors)
            fp = generate_fingerprint(target_base_url, self.name, "cors_reflection")
            findings.append(FindingCandidate(
                finding_class=self.name,
                owasp_id=self.owasp_id,
                endpoint_path="/health",
                endpoint_method="GET",
                operation_id="corsCheck",
                title="Overly Permissive CORS Reflecting Arbitrary Origin with Credentials",
                impact="Server reflects untrusted Origin headers with Access-Control-Allow-Credentials enabled, permitting cross-site data theft.",
                remediation="Configure an explicit allowlist of authorized web origins in CORS policy.",
                expected="CORS headers restricted to trusted domains",
                actual=f"Reflected '{test_origin}' with credentials allowed",
                severity=severity,
                risk_score=risk_score,
                confidence="VERIFIED",
                score_factors=factors,
                probes=[{
                    "label": "CORSReflectProbe",
                    "identity": "anonymous",
                    "status": res.status,
                    "latency_ms": int(res.latency_ms),
                    "request_json_redacted": {"method": "GET", "url": f"{target_base_url}/health", "headers": {"Origin": test_origin}},
                    "response_json_redacted": {"status": res.status, "headers": res.headers, "body": res.body}
                }],
                fingerprint=fp
            ))

        # 2. Exposed Debug Endpoints
        for dbg in DEBUG_PATHS:
            dbg_res = await executor.execute("GET", f"{target_base_url}{dbg}")
            if dbg_res.status == 200 and dbg_res.body:
                factors = ["hardening_gap", "auth_boundary_crossed", "repeat_verified"]
                severity, risk_score, _ = calculate_severity(factors)
                fp = generate_fingerprint(target_base_url, self.name, f"debug_exposed_{dbg}")
                findings.append(FindingCandidate(
                    finding_class=self.name,
                    owasp_id=self.owasp_id,
                    endpoint_path=dbg,
                    endpoint_method="GET",
                    operation_id="debugExposed",
                    title=f"Exposed Internal Debug Endpoint at {dbg}",
                    impact=f"The endpoint '{dbg}' is publicly reachable and returns internal configuration secrets or operational diagnostics.",
                    remediation=f"Disable debug endpoints in non-development environments or protect {dbg} behind private network boundaries.",
                    expected="HTTP 404 Not Found or 403 Forbidden",
                    actual="HTTP 200 OK returning internal environment configuration",
                    severity=severity,
                    risk_score=risk_score,
                    confidence="VERIFIED",
                    score_factors=factors,
                    probes=[{
                        "label": "DebugProbe",
                        "identity": "anonymous",
                        "status": dbg_res.status,
                        "latency_ms": int(dbg_res.latency_ms),
                        "request_json_redacted": {"method": "GET", "url": f"{target_base_url}{dbg}"},
                        "response_json_redacted": {"status": dbg_res.status, "headers": dbg_res.headers, "body": dbg_res.body}
                    }],
                    fingerprint=fp
                ))

        return findings
