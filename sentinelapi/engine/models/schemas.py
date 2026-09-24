from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# Target schemas
class TargetCreate(BaseModel):
    base_url: str
    environment: str = "sandbox"
    attested_by: Optional[str] = None

class TargetResponse(BaseModel):
    id: int
    base_url: str
    environment: str
    attested_by: Optional[str] = None
    attested_at: Optional[datetime] = None

# Identity schemas
class IdentityCreate(BaseModel):
    label: str       # "userA", "userB", "admin", "anonymous"
    role: str        # "user", "admin", "anonymous"
    user_id: Optional[str] = None
    credential: Optional[str] = None  # Raw token/password (encrypted before DB storage)

class IdentityResponse(BaseModel):
    id: int
    target_id: int
    label: str
    role: str
    user_id: Optional[str] = None

class IdentityVerificationResult(BaseModel):
    identity: str
    ok: bool
    status_code: Optional[int] = None
    message: str

class VerifyIdentitiesResponse(BaseModel):
    target_id: int
    all_ok: bool
    results: List[IdentityVerificationResult]

# Spec schemas
class EndpointSchema(BaseModel):
    id: Optional[int] = None
    method: str
    path: str
    operation_id: Optional[str] = None
    summary: Optional[str] = None
    spec_secured: bool = False
    object_bearing: bool = False
    admin_scoped: bool = False
    params_json: Optional[Any] = None
    response_fields_json: Optional[Any] = None

class SpecUploadResponse(BaseModel):
    spec_id: int
    target_id: int
    endpoint_count: int
    secured_count: int
    object_bearing_count: int
    admin_scoped_count: int
    endpoints: List[EndpointSchema]

# Scan schemas
class ScanCreate(BaseModel):
    target_id: int
    spec_id: int
    checks: List[str] = [
        "BOLA", "BFLA", "EXCESSIVE_DATA_EXPOSURE", "BROKEN_AUTH", "RATE_LIMITING", "MISCONFIGURATION"
    ]
    max_requests: int = 500

class ScanResponse(BaseModel):
    id: int
    target_id: int
    spec_id: int
    status: str
    phase: Optional[str] = None
    requests_used: int = 0
    duration_ms: Optional[int] = None
    risk_score: Optional[float] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    total_findings: Optional[int] = 0

# Score factor
class ScoreFactor(BaseModel):
    description: str
    weight: int
    applied: bool

# Probe
class ProbeModel(BaseModel):
    id: Optional[int] = None
    label: str
    identity: str
    status: int
    latency_ms: Optional[int] = None
    request_json_redacted: Dict[str, Any]
    response_json_redacted: Dict[str, Any]

# Finding
class FindingResponse(BaseModel):
    id: int
    scan_id: int
    fingerprint: str
    finding_class: str = Field(alias="class")
    owasp_id: str
    severity: str
    risk_score: float
    confidence: str
    title: str
    impact: Optional[str] = None
    remediation: Optional[str] = None
    score_factors: List[ScoreFactor] = []
    expected: Optional[str] = None
    actual: Optional[str] = None
    state: str = "open"
    ai_explanation_md: Optional[str] = None
    probes: Optional[List[ProbeModel]] = None

    class Config:
        populate_by_name = True

# Matrix cell
class MatrixCellModel(BaseModel):
    id: Optional[int] = None
    scan_id: int
    endpoint_id: int
    method: Optional[str] = None
    path: Optional[str] = None
    identity: str
    object_id: Optional[str] = None
    object_owner: Optional[str] = None
    status: int
    duration_ms: Optional[int] = None
    ownership_mismatch: bool = False
    undocumented_fields: List[str] = []
    sensitive_fields: List[str] = []

# PoC & AI
class FindingPoCResponse(BaseModel):
    finding_id: int
    curl: str
    httpie: Optional[str] = None
    python_code: Optional[str] = None

class AIExplainResponse(BaseModel):
    finding_id: int
    explanation_md: str
    source: str  # "groq" or "template_fallback"

class AISummaryResponse(BaseModel):
    scan_id: int
    summary_text: str
    source: str
