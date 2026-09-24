from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class FindingCandidate:
    finding_class: str
    owasp_id: str
    endpoint_path: str
    endpoint_method: str
    operation_id: str
    title: str
    impact: str
    remediation: str
    expected: str
    actual: str
    severity: str
    risk_score: float
    confidence: str  # "VERIFIED" or "POTENTIAL"
    score_factors: List[str] = field(default_factory=list)
    probes: List[Dict[str, Any]] = field(default_factory=list)
    fingerprint: str = ""

class BaseDetector:
    def __init__(self, name: str, owasp_id: str):
        self.name = name
        self.owasp_id = owasp_id
