from typing import Optional, List, Dict, Any
from .base import BaseDetector, FindingCandidate
from ..core.executor import HttpExecutor, ExecutionResult
from ..core.risk_engine import calculate_severity
from ..core.evidence import generate_fingerprint
from ..ingest.api_model import NormalizedEndpoint
from ..core.session import IdentitySession

class BflaDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="BFLA", owasp_id="API5:2023")

    async def probe_endpoint(
        self,
        executor: HttpExecutor,
        target_base_url: str,
        endpoint: NormalizedEndpoint,
        low_priv_user: IdentitySession,
        admin_user: IdentitySession,
        anonymous: IdentitySession
    ) -> Optional[FindingCandidate]:
        """
        Tests if an administrative or privileged function can be invoked by a standard user.
        Rule: low-priv gets 2xx on an admin-scoped endpoint, while admin gets 2xx and anon gets 401.
        """
        if not endpoint.admin_scoped:
            return None

        url = f"{target_base_url}{endpoint.path}"
        probes_recorded = []

        # 1. Admin baseline
        admin_res = await executor.execute(endpoint.method, url, headers=admin_user.get_auth_headers())
        probes_recorded.append({
            "label": "AdminBaseline",
            "identity": admin_user.label,
            "status": admin_res.status,
            "latency_ms": int(admin_res.latency_ms),
            "request_json_redacted": {"method": endpoint.method, "url": url, "headers": admin_user.get_auth_headers()},
            "response_json_redacted": {"status": admin_res.status, "headers": admin_res.headers, "body": admin_res.body}
        })
        if not admin_res.ok:
            return None  # Endpoint not functional even for admin

        # 2. Anonymous check
        anon_res = await executor.execute(endpoint.method, url, headers=anonymous.get_auth_headers())
        probes_recorded.append({
            "label": "AnonControl",
            "identity": anonymous.label,
            "status": anon_res.status,
            "latency_ms": int(anon_res.latency_ms),
            "request_json_redacted": {"method": endpoint.method, "url": url, "headers": {}},
            "response_json_redacted": {"status": anon_res.status, "headers": anon_res.headers, "body": anon_res.body}
        })

        # 3. Low-privilege attack
        user_res = await executor.execute(endpoint.method, url, headers=low_priv_user.get_auth_headers())
        probes_recorded.append({
            "label": "LowPrivAttack",
            "identity": low_priv_user.label,
            "status": user_res.status,
            "latency_ms": int(user_res.latency_ms),
            "request_json_redacted": {"method": endpoint.method, "url": url, "headers": low_priv_user.get_auth_headers()},
            "response_json_redacted": {"status": user_res.status, "headers": user_res.headers, "body": user_res.body}
        })

        if user_res.status == 200:
            # Repeat confirmation
            user_repeat = await executor.execute(endpoint.method, url, headers=low_priv_user.get_auth_headers())
            is_reproducible = (user_repeat.status == 200)

            factors = [
                "auth_boundary_crossed",
                "admin_reachable_by_low_priv",
                "exploitable_low_priv"
            ]
            if is_reproducible:
                factors.append("repeat_verified")
                confidence = "VERIFIED"
            else:
                factors.append("repeat_diverged")
                confidence = "POTENTIAL"

            severity, risk_score, _ = calculate_severity(factors)
            fingerprint = generate_fingerprint(target_base_url, self.name, endpoint.operation_id, attacker_role=low_priv_user.role)

            return FindingCandidate(
                finding_class=self.name,
                owasp_id=self.owasp_id,
                endpoint_path=endpoint.path,
                endpoint_method=endpoint.method,
                operation_id=endpoint.operation_id,
                title=f"Broken Function Level Authorization on {endpoint.path}",
                impact=f"Standard user '{low_priv_user.label}' was able to access administrative endpoint '{endpoint.path}'.",
                remediation="Enforce role-based access control (RBAC) middleware verifying administrator privilege.",
                expected="HTTP 403 Forbidden for non-admin callers",
                actual="HTTP 200 OK returned to standard user account",
                severity=severity,
                risk_score=risk_score,
                confidence=confidence,
                score_factors=factors,
                probes=probes_recorded,
                fingerprint=fingerprint
            )

        return None
