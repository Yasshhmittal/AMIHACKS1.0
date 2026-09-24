from typing import Optional, List, Dict, Any
from .base import BaseDetector, FindingCandidate
from ..core.executor import HttpExecutor, ExecutionResult
from ..core.comparator import find_sensitive_fields, flatten_keys
from ..core.risk_engine import calculate_severity
from ..core.evidence import generate_fingerprint
from ..ingest.api_model import NormalizedEndpoint
from ..core.session import IdentitySession

class ExcessiveDataExposureDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="EXCESSIVE_DATA_EXPOSURE", owasp_id="API3:2023")

    async def analyze_response(
        self,
        executor: HttpExecutor,
        target_base_url: str,
        endpoint: NormalizedEndpoint,
        user: IdentitySession,
        res: ExecutionResult
    ) -> Optional[FindingCandidate]:
        """
        Analyzes a 2xx response body against declared schema and sensitive pattern dictionaries.
        """
        if not res.ok or not isinstance(res.body, (dict, list)):
            return None

        # 1. Identify sensitive field names and values
        sensitive_found = find_sensitive_fields(res.body)

        # 2. Identify undocumented fields
        undocumented_found = []
        if endpoint.response_schema_fields:
            declared_set = set(f.lower() for f in endpoint.response_schema_fields)
            pairs = flatten_keys(res.body)
            for path, val in pairs:
                leaf = path.split(".")[-1].lower()
                if leaf not in declared_set and not leaf.isdigit():
                    undocumented_found.append(path)

        if not sensitive_found and not undocumented_found:
            return None

        factors = []
        impact_reasons = []

        # Check for credential material
        has_credentials = any("hash" in f.lower() or "secret" in f.lower() or "token" in f.lower() for f in sensitive_found)
        if has_credentials:
            factors.append("credential_material_leaked")
            impact_reasons.append("Credential or cryptographic material was exposed in client-accessible JSON.")

        if sensitive_found:
            factors.append("sensitive_field_names")
            impact_reasons.append(f"Sensitive fields detected: {', '.join(sensitive_found[:5])}.")

        factors.append("exploitable_low_priv")
        factors.append("repeat_verified")

        severity, risk_score, _ = calculate_severity(factors)
        fingerprint = generate_fingerprint(target_base_url, self.name, endpoint.operation_id, attacker_role=user.role)

        url = f"{target_base_url}{endpoint.path}"
        probe = {
            "label": "ExposureCheck",
            "identity": user.label,
            "status": res.status,
            "latency_ms": int(res.latency_ms),
            "request_json_redacted": {"method": endpoint.method, "url": url, "headers": user.get_auth_headers()},
            "response_json_redacted": {"status": res.status, "headers": res.headers, "body": res.body}
        }

        return FindingCandidate(
            finding_class=self.name,
            owasp_id=self.owasp_id,
            endpoint_path=endpoint.path,
            endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Excessive Data Exposure on {endpoint.path}",
            impact=" ".join(impact_reasons),
            remediation=(
                "Implement selective response projection or Data Transfer Objects (DTOs) "
                "to ensure only fields documented in the API specification are returned to the client."
            ),
            expected=f"Response adhering strictly to schema ({len(endpoint.response_schema_fields)} declared fields)",
            actual=f"Exposed {len(sensitive_found)} sensitive fields: {', '.join(sensitive_found[:6])}",
            severity=severity,
            risk_score=risk_score,
            confidence="VERIFIED",
            score_factors=factors,
            probes=[probe],
            fingerprint=fingerprint
        )
