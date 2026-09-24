"""Detector base + the FindingCandidate the engine emits."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class FindingCandidate:
    finding_class: str
    owasp_id: str
    endpoint_path: str
    endpoint_method: str
    title: str
    severity: str
    risk_score: float
    confidence: str
    fingerprint: str
    operation_id: Optional[str] = None
    impact: Optional[str] = None
    remediation: Optional[str] = None
    expected: Optional[str] = None
    actual: Optional[str] = None
    score_factors: List[dict] = field(default_factory=list)
    probes: List[dict] = field(default_factory=list)
    vuln_id: Optional[str] = None

    @property
    def endpoint(self) -> str:
        return f"{self.endpoint_method} {self.endpoint_path}"


class BaseDetector:
    name: str = "BASE"
    owasp_id: str = ""

    def __init__(self, name: Optional[str] = None, owasp_id: Optional[str] = None):
        if name:
            self.name = name
        if owasp_id:
            self.owasp_id = owasp_id

    @staticmethod
    def record_probe(probes: List[dict], label: str, identity: str,
                     method: str, url: str, req_headers: Dict[str, str], res) -> None:
        from ..core.redact import redact_request, redact_response
        probes.append({
            "label": label,
            "identity": identity,
            "status": res.status,
            "latency_ms": int(res.latency_ms),
            "request_json_redacted": redact_request(method, url, req_headers),
            "response_json_redacted": redact_response(res.status, res.headers, res.body),
        })
