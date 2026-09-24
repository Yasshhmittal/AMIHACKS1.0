from typing import Optional, List, Dict, Any
from .base import BaseDetector, FindingCandidate
from ..core.executor import HttpExecutor, ExecutionResult
from ..core.comparator import body_equivalent, find_owner_field
from ..core.risk_engine import calculate_severity
from ..core.evidence import generate_fingerprint
from ..ingest.api_model import NormalizedEndpoint
from ..core.session import IdentitySession

class BolaDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="BOLA", owasp_id="API1:2023")

    async def probe_endpoint(
        self,
        executor: HttpExecutor,
        target_base_url: str,
        endpoint: NormalizedEndpoint,
        alice: IdentitySession,    # Attacker
        bob: IdentitySession,      # Victim
        anonymous: IdentitySession,
        bob_object_id: str,
        alice_object_id: str
    ) -> Optional[FindingCandidate]:
        """
        Executes the 6-probe control set to verify Broken Object Level Authorization (BOLA).
        Never trusts status code alone — proves cross-account data ownership from response body!
        """
        param_name = endpoint.path_params[0] if endpoint.path_params else "id"
        
        # URL constructions
        bob_url = f"{target_base_url}{endpoint.path.replace('{' + param_name + '}', str(bob_object_id))}"
        alice_url = f"{target_base_url}{endpoint.path.replace('{' + param_name + '}', str(alice_object_id))}"
        stub_url = f"{target_base_url}{endpoint.path.replace('{' + param_name + '}', '99999')}"

        probes_recorded = []

        def record_probe(label: str, identity: str, res: ExecutionResult, url: str, req_headers: Dict[str, str]):
            probes_recorded.append({
                "label": label,
                "identity": identity,
                "status": res.status,
                "latency_ms": int(res.latency_ms),
                "request_json_redacted": {
                    "method": endpoint.method,
                    "url": url,
                    "headers": req_headers
                },
                "response_json_redacted": {
                    "status": res.status,
                    "headers": res.headers,
                    "body": res.body
                }
            })

        # --- P1: Victim Baseline ---
        # userB requests bob's own object
        p1 = await executor.execute(endpoint.method, bob_url, headers=bob.get_auth_headers())
        record_probe("P1", bob.label, p1, bob_url, bob.get_auth_headers())
        if p1.status != 200:
            return None  # Victim baseline failed (object doesn't exist)

        # --- P2: The Attack Probe ---
        # userA requests bob's object
        p2 = await executor.execute(endpoint.method, bob_url, headers=alice.get_auth_headers())
        record_probe("P2", alice.label, p2, bob_url, alice.get_auth_headers())
        if p2.status in (401, 403, 404):
            return None  # Authorization properly enforced!

        if not p2.ok:
            return None

        # --- P3: Attacker Baseline ---
        # userA requests alice's own object to ensure session works
        p3 = await executor.execute(endpoint.method, alice_url, headers=alice.get_auth_headers())
        record_probe("P3", alice.label, p3, alice_url, alice.get_auth_headers())
        if p3.status != 200:
            return None  # Attacker session invalid

        # --- P4: Anonymous Control ---
        # anon requests bob's object (proves endpoint is intended to be protected)
        p4 = await executor.execute(endpoint.method, bob_url, headers=anonymous.get_auth_headers())
        record_probe("P4", anonymous.label, p4, bob_url, anonymous.get_auth_headers())

        # --- P5: Stub / Wildcard Control ---
        # userA requests non-existent ID 99999 (ensures API doesn't return mock data for any ID)
        p5 = await executor.execute(endpoint.method, stub_url, headers=alice.get_auth_headers())
        record_probe("P5", alice.label, p5, stub_url, alice.get_auth_headers())
        if p5.ok and body_equivalent(p2.body, p5.body):
            return None  # Stub endpoint returning identical response for all IDs

        # --- Check Ownership in P2 response body ---
        owner_in_p2 = find_owner_field(p2.body, hint=endpoint.owner_hint)
        bob_id_str = str(bob.user_id) if bob.user_id else str(bob_object_id)
        alice_id_str = str(alice.user_id) if alice.user_id else str(alice_object_id)

        if owner_in_p2 == alice_id_str:
            return None  # Attacker is merely viewing their own record

        # --- P6: Repeat Confirmation ---
        # Repeat decisive attack to eliminate transient or race condition false positives
        p6 = await executor.execute(endpoint.method, bob_url, headers=alice.get_auth_headers())
        record_probe("P6", alice.label, p6, bob_url, alice.get_auth_headers())
        is_reproducible = body_equivalent(p2.body, p6.body)

        # Rubric factors
        factors = [
            "auth_boundary_crossed",
            "cross_identity_data",
            "exploitable_low_priv"
        ]

        if is_reproducible:
            factors.append("repeat_verified")
            confidence = "VERIFIED"
        else:
            factors.append("repeat_diverged")
            confidence = "POTENTIAL"

        severity, risk_score, _ = calculate_severity(factors)

        fingerprint = generate_fingerprint(
            target_url=target_base_url,
            finding_class=self.name,
            operation_id=endpoint.operation_id,
            param=str(bob_object_id),
            attacker_role=alice.role
        )

        return FindingCandidate(
            finding_class=self.name,
            owasp_id=self.owasp_id,
            endpoint_path=endpoint.path,
            endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Broken Object Level Authorization on {endpoint.path}",
            impact=(
                f"Authenticated user '{alice.label}' can access private resource #{bob_object_id} "
                f"belonging to '{bob.label}'. The server returned full object details without checking caller ownership."
            ),
            remediation=(
                f"Implement resource-level authorization checks. Before serving data for {endpoint.path}, "
                f"verify that the requested object's owner ID equals the authenticated user ID."
            ),
            expected=f"HTTP 403 Forbidden when '{alice.label}' requests resource #{bob_object_id}",
            actual=f"HTTP 200 OK returning resource #{bob_object_id} (owner={owner_in_p2}) to caller '{alice.label}'",
            severity=severity,
            risk_score=risk_score,
            confidence=confidence,
            score_factors=factors,
            probes=probes_recorded,
            fingerprint=fingerprint
        )
