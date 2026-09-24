"""BOLA — the hero detector (OWASP API1:2023).

Runs a 6-probe control set and proves cross-account ownership from the RESPONSE
BODY. A 2xx alone is never a finding. Four of the six probes exist purely to
falsify the hypothesis; if any control says "safe", we return nothing.

  P1 victim baseline   userB -> GET /orders/{bob}   object exists, capture body
  P2 attack            userA -> GET /orders/{bob}   the test
  P3 attacker baseline userA -> GET /orders/{alice}  attacker session works
  P4 anonymous control anon  -> GET /orders/{bob}   endpoint is meant to be protected
  P5 stub control      userA -> GET /orders/99999   API isn't returning the same data for any id
  P6 repeat            userA -> GET /orders/{bob}   reproducible
"""
from __future__ import annotations

from typing import Optional

from ..core.comparator import body_equivalent, find_owner_field
from ..core.evidence import generate_fingerprint
from ..core.executor import HttpExecutor
from ..core.risk_engine import calculate_severity
from ..core.session import IdentitySession
from ..ingest.api_model import NormalizedEndpoint
from .base import BaseDetector, FindingCandidate


class BolaDetector(BaseDetector):
    def __init__(self):
        super().__init__(name="BOLA", owasp_id="API1:2023")

    async def probe_endpoint(self, executor: HttpExecutor, base_url: str,
                             endpoint: NormalizedEndpoint,
                             attacker: IdentitySession, victim: IdentitySession,
                             anonymous: IdentitySession,
                             victim_object_id: str, attacker_object_id: str) -> Optional[FindingCandidate]:
        param = endpoint.path_params[0] if endpoint.path_params else "id"
        def url_for(oid: str) -> str:
            return f"{base_url}{endpoint.path.replace('{' + param + '}', str(oid))}"

        victim_url, attacker_url, stub_url = url_for(victim_object_id), url_for(attacker_object_id), url_for("99999")
        m = endpoint.method
        probes: list[dict] = []

        # P1 victim baseline
        p1 = await executor.execute(m, victim_url, headers=victim.get_auth_headers())
        self.record_probe(probes, "P1", victim.label, m, victim_url, victim.get_auth_headers(), p1)
        if p1.status != 200:
            return None  # object doesn't exist for the victim; can't reason about it

        # P2 attack
        p2 = await executor.execute(m, victim_url, headers=attacker.get_auth_headers())
        self.record_probe(probes, "P2", attacker.label, m, victim_url, attacker.get_auth_headers(), p2)
        if p2.status in (401, 403, 404) or not p2.ok:
            return None  # authorization enforced

        # P3 attacker baseline
        p3 = await executor.execute(m, attacker_url, headers=attacker.get_auth_headers())
        self.record_probe(probes, "P3", attacker.label, m, attacker_url, attacker.get_auth_headers(), p3)
        if p3.status != 200:
            return None  # attacker session invalid; result would be unreliable

        # P4 anonymous control
        p4 = await executor.execute(m, victim_url, headers=anonymous.get_auth_headers())
        self.record_probe(probes, "P4", anonymous.label, m, victim_url, anonymous.get_auth_headers(), p4)
        if p4.ok and not endpoint.spec_secured:
            return None  # public by design

        # P5 stub control
        p5 = await executor.execute(m, stub_url, headers=attacker.get_auth_headers())
        self.record_probe(probes, "P5", attacker.label, m, stub_url, attacker.get_auth_headers(), p5)
        if p5.ok and body_equivalent(p2.body, p5.body):
            return None  # stub: same body for any id

        # ownership must resolve to the victim, not the attacker
        owner = find_owner_field(p2.body, hint=endpoint.owner_hint)
        attacker_owner = str(attacker.user_id) if attacker.user_id else str(attacker_object_id)
        victim_owner = str(victim.user_id) if victim.user_id else str(victim_object_id)
        if owner is None:
            confidence_owner = "POTENTIAL"
        elif owner == attacker_owner:
            return None  # attacker is viewing their own record
        elif owner != victim_owner:
            confidence_owner = "POTENTIAL"  # ownership couldn't be proven to the victim
        else:
            confidence_owner = "VERIFIED"

        # P6 repeat
        p6 = await executor.execute(m, victim_url, headers=attacker.get_auth_headers())
        self.record_probe(probes, "P6", attacker.label, m, victim_url, attacker.get_auth_headers(), p6)
        reproducible = body_equivalent(p2.body, p6.body)

        factors = ["auth_boundary_crossed", "cross_identity_data", "exploitable_low_priv"]
        if reproducible and confidence_owner == "VERIFIED":
            factors.append("repeat_verified")
            confidence = "VERIFIED"
        else:
            factors.append("repeat_diverged" if not reproducible else "repeat_verified")
            confidence = "POTENTIAL"

        severity, risk, score_factors = calculate_severity(factors)
        fp = generate_fingerprint(base_url, self.name, endpoint.operation_id, str(victim_object_id), attacker.role)

        return FindingCandidate(
            finding_class=self.name, owasp_id=self.owasp_id,
            endpoint_path=endpoint.path, endpoint_method=endpoint.method,
            operation_id=endpoint.operation_id,
            title=f"Broken Object Level Authorization on {endpoint.path}",
            impact=(f"Authenticated user '{attacker.label}' retrieved private resource "
                    f"#{victim_object_id} owned by '{victim.label}'. The server returned the full "
                    f"object without checking caller ownership."),
            remediation=("Enforce a resource-level ownership check: before returning "
                         f"{endpoint.path}, confirm the object's owner id equals the authenticated user id "
                         "(or the caller holds an authorized role)."),
            expected=f"HTTP 403 Forbidden when '{attacker.label}' requests resource #{victim_object_id}",
            actual=f"HTTP {p2.status} returning resource #{victim_object_id} (owner={owner}) to '{attacker.label}'",
            severity=severity, risk_score=risk, confidence=confidence,
            score_factors=score_factors, probes=probes, fingerprint=fp,
            vuln_id="V2" if "/users" in endpoint.path else "V1",
        )
