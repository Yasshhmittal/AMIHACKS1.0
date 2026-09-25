"""Pydantic request/response models — the frozen API contract (H03).

These are the shapes the frontend TypeScript interfaces mirror 1:1.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

# ------------------------------------------------------------------ Targets

class TargetCreate(BaseModel):
    base_url: str
    environment: str = "sandbox"
    attested_by: Optional[str] = None


class TargetResponse(BaseModel):
    id: int
    base_url: str
    environment: str
    attested_by: Optional[str] = None
    attested_at: Optional[str] = None


# ------------------------------------------------------------------ Identities

class IdentityIn(BaseModel):
    label: str
    role: str
    user_id: Optional[str] = None
    credential: Optional[str] = None  # inbound only, never echoed back
    credential_type: Optional[str] = "bearer"  # "bearer" | "password" | "api_key"
    login_url: Optional[str] = None  # full login endpoint URL for password-based auth
    login_body: Optional[Dict[str, Any]] = None  # JSON body for the login request


class IdentityResponse(BaseModel):
    id: int
    target_id: int
    label: str
    role: str
    user_id: Optional[str] = None


class VerifyResultItem(BaseModel):
    identity: str
    ok: bool
    status: int


class VerifyResponse(BaseModel):
    results: List[VerifyResultItem]


# ------------------------------------------------------------------ Spec / Endpoints

class EndpointResponse(BaseModel):
    id: int
    spec_id: int
    method: str
    path: str
    operation_id: Optional[str] = None
    summary: Optional[str] = None
    spec_secured: bool = False
    object_bearing: bool = False
    admin_scoped: bool = False


class SpecUploadResponse(BaseModel):
    spec_id: int
    endpoint_count: int
    secured_count: int
    object_bearing_count: int
    admin_count: int
    endpoints: List[EndpointResponse]


# ------------------------------------------------------------------ Scans

class ScanCreate(BaseModel):
    target_id: int
    spec_id: int
    checks: List[str] = Field(default_factory=list)


class ScanResponse(BaseModel):
    id: int
    target_id: int
    spec_id: int
    status: str
    phase: Optional[str] = None
    requests_used: int = 0
    duration_ms: Optional[int] = None
    risk_score: Optional[float] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    total_findings: int = 0
    findings_by_severity: Dict[str, int] = Field(default_factory=dict)


class ScanEventModel(BaseModel):
    seq: int
    type: str
    payload: Dict[str, Any]


# ------------------------------------------------------------------ Findings

class ScoreFactor(BaseModel):
    description: str
    weight: int
    applied: bool


class ProbeModel(BaseModel):
    id: int
    label: str
    identity: str
    status: int
    latency_ms: Optional[int] = None
    request_json_redacted: Dict[str, Any]
    response_json_redacted: Dict[str, Any]


class FindingResponse(BaseModel):
    id: int
    scan_id: int
    fingerprint: str
    finding_class: str = Field(serialization_alias="class")
    owasp_id: str
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
    risk_score: float
    confidence: Literal["VERIFIED", "POTENTIAL"]
    title: str
    impact: Optional[str] = None
    remediation: Optional[str] = None
    score_factors: List[ScoreFactor] = Field(default_factory=list)
    expected: Optional[str] = None
    actual: Optional[str] = None
    endpoint: Optional[str] = None
    vuln_id: Optional[str] = None
    state: str = "open"
    ai_explanation_md: Optional[str] = None
    probes: Optional[List[ProbeModel]] = None

    model_config = {"populate_by_name": True}


class MatrixCellModel(BaseModel):
    id: int
    scan_id: int
    endpoint_id: Optional[int] = None
    method: str
    path: str
    identity: str
    object_id: Optional[str] = None
    object_owner: Optional[str] = None
    status: int
    duration_ms: Optional[int] = None
    ownership_mismatch: bool = False
    undocumented_fields: List[str] = Field(default_factory=list)
    sensitive_fields: List[str] = Field(default_factory=list)


# ------------------------------------------------------------------ AI / report / demo

class ExplainResponse(BaseModel):
    finding_id: int
    explanation_md: str
    provider: str


class SummaryResponse(BaseModel):
    scan_id: int
    text: str
    provider: str
    total_endpoints: int
    total_requests: int
    findings_by_severity: Dict[str, int]
    findings_by_class: Dict[str, int]
    risk_score: float


class ReverifyResponse(BaseModel):
    finding_id: int
    status: Literal["still-vulnerable", "fixed"]
    detail: str


class PoCResponse(BaseModel):
    finding_id: int
    curl: str
    httpie: str
    python: str


class FixToggleRequest(BaseModel):
    enabled: bool = True


class SimpleStatus(BaseModel):
    status: str
    detail: Optional[str] = None
