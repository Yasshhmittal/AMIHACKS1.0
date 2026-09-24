from typing import Optional, List, Dict, Any
from .base import BaseDetector, FindingCandidate
from ..core.executor import HttpExecutor, ExecutionResult
from ..core.risk_engine import calculate_severity
from ..core.evidence import generate_fingerprint
from ..ingest.api_model import NormalizedEndpoint
from ..core.session import IdentitySession

class BrokenAuthDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="BROKEN_AUTH", owasp_id="API2:2023")

    async def probe_endpoint(
        self,
        executor: HttpExecutor,
        target_base_url: str,
        endpoint: NormalizedEndpoint,
        anonymous: IdentitySession,
        authenticated_user: IdentitySession
    ) -> Optional[FindingCandidate]:
        """
        Tests if an endpoint documented as secured in OpenAPI can be accessed anonymously.
        """
        if not endpoint.spec_secured or endpoint.object_bearing:
            return None

        url = f"{target_base_url}{endpoint.path}"
        probes_recorded = []

        # 1. Valid session control
        auth_res = await executor.execute(endpoint.method, url, headers=authenticated_user.get_auth_headers())
        probes_recorded.append({
            "label": "AuthenticatedControl",
            "identity": authenticated_user.label,
            "status": auth_res.status,
            "latency_ms": int(auth_res.latency_ms),
            "request_json_redacted": {"method": endpoint.method, "url": url, "headers": authenticated_user.get_auth_headers()},
            "response_json_redacted": {"status": auth_res.status, "headers": auth_res.headers, "body": auth_res.body}
        })
        if not auth_res.ok:
            return None

        # 2. Anonymous attack probe
        anon_res = await executor.execute(endpoint.method, url, headers=anonymous.get_auth_headers())
        probes_recorded.append({
            "label": "AnonymousAttack",
            "identity": anonymous.label,
            "status": anon_res.status,
            "latency_ms": int(anon_res.latency_ms),
            "request_json_redacted": {"method": endpoint.method, "url": url, "headers": {}},
            "response_json_redacted": {"status": anon_res.status, "headers": anon_res.headers, "body": anon_res.body}
        })

        if anon_res.status == 200 and anon_res.body:
            # Repeat to confirm
            anon_repeat = await executor.execute(endpoint.method, url, headers=anonymous.get_auth_headers())
            is_reproducible = (anon_repeat.status == 200)

            factors = [
                "auth_boundary_crossed",
                "exploitable_anonymous",
                "cross_identity_data"
            ]
            if is_reproducible:
                factors.append("repeat_verified")
                confidence = "VERIFIED"
            else:
                factors.append("repeat_diverged")
                confidence = "POTENTIAL"

            severity, risk_score, _ = calculate_severity(factors)
            fingerprint = generate_fingerprint(target_base_url, self.name, endpoint.operation_id, attacker_role="anonymous")

            return FindingCandidate(
                finding_class=self.name,
                owasp_id=self.owasp_id,
                endpoint_path=endpoint.path,
                endpoint_method=endpoint.method,
                operation_id=endpoint.operation_id,
                title=f"Broken Authentication on {endpoint.path}",
                impact=(
                    f"Endpoint '{endpoint.path}' is declared as secured by BearerAuth in OpenAPI, "
                    "yet allows completely unauthenticated anonymous requests to read confidential data."
                ),
                remediation="Ensure authentication middleware or dependency injection is applied to this route handler.",
                expected="HTTP 401 Unauthorized for anonymous callers",
                actual="HTTP 200 OK returning confidential data without credentials",
                severity=severity,
                risk_score=risk_score,
                confidence=confidence,
                score_factors=factors,
                probes=probes_recorded,
                fingerprint=fingerprint
            )

        return None
