"""SQLModel ORM tables (SQLite). JSON columns store structured payloads.

Deliberately declared with plain columns + foreign-key ids and NO ORM
Relationship() navigation: the engine always queries with explicit select(...),
so relationships add nothing here and only invite SQLModel/SQLAlchemy version
friction. Naming mirrors the frozen API contract so row -> Pydantic mapping is
mechanical.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column
from sqlalchemy import JSON as SA_JSON
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Target(SQLModel, table=True):
    __tablename__ = "targets"
    id: Optional[int] = Field(default=None, primary_key=True)
    base_url: str
    environment: str = "sandbox"
    attested_by: Optional[str] = None
    attested_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)


class Identity(SQLModel, table=True):
    __tablename__ = "identities"
    id: Optional[int] = Field(default=None, primary_key=True)
    target_id: int = Field(foreign_key="targets.id", index=True)
    label: str
    role: str
    user_id: Optional[str] = None
    credential_encrypted: Optional[str] = None  # vault ciphertext, never returned raw
    credential_type: str = "bearer"  # "bearer" | "password" | "api_key"
    login_config_json: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))  # {login_url, login_body}


class Spec(SQLModel, table=True):
    __tablename__ = "specs"
    id: Optional[int] = Field(default=None, primary_key=True)
    target_id: int = Field(foreign_key="targets.id", index=True)
    raw_hash: str
    parsed_json: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))
    endpoint_count: int = 0
    created_at: datetime = Field(default_factory=_now)


class Endpoint(SQLModel, table=True):
    __tablename__ = "endpoints"
    id: Optional[int] = Field(default=None, primary_key=True)
    spec_id: int = Field(foreign_key="specs.id", index=True)
    method: str
    path: str
    operation_id: Optional[str] = None
    summary: Optional[str] = None
    spec_secured: bool = False
    object_bearing: bool = False
    admin_scoped: bool = False
    params_json: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))
    response_fields_json: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))


class Scan(SQLModel, table=True):
    __tablename__ = "scans"
    id: Optional[int] = Field(default=None, primary_key=True)
    target_id: int = Field(foreign_key="targets.id", index=True)
    spec_id: int = Field(foreign_key="specs.id", index=True)
    status: str = "pending"  # pending|running|completed|failed|aborted
    phase: Optional[str] = None
    config_json: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))
    requests_used: int = 0
    duration_ms: Optional[int] = None
    risk_score: Optional[float] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)


class MatrixCell(SQLModel, table=True):
    __tablename__ = "matrix_cells"
    id: Optional[int] = Field(default=None, primary_key=True)
    scan_id: int = Field(foreign_key="scans.id", index=True)
    endpoint_id: Optional[int] = None
    method: str = "GET"
    path: str = ""
    identity: str = ""
    object_id: Optional[str] = None
    object_owner: Optional[str] = None
    status: int = 0
    duration_ms: Optional[int] = None
    ownership_mismatch: bool = False
    undocumented_fields: Any = Field(default_factory=list, sa_column=Column(SA_JSON))
    sensitive_fields: Any = Field(default_factory=list, sa_column=Column(SA_JSON))


class Finding(SQLModel, table=True):
    __tablename__ = "findings"
    id: Optional[int] = Field(default=None, primary_key=True)
    scan_id: int = Field(foreign_key="scans.id", index=True)
    fingerprint: str = ""
    finding_class: str = ""
    owasp_id: str = ""
    severity: str = "INFO"
    risk_score: float = 0.0
    confidence: str = "POTENTIAL"
    title: str = ""
    impact: Optional[str] = None
    remediation: Optional[str] = None
    score_factors_json: Any = Field(default_factory=list, sa_column=Column(SA_JSON))
    expected: Optional[str] = None
    actual: Optional[str] = None
    endpoint: Optional[str] = None
    vuln_id: Optional[str] = None
    state: str = "open"  # open|fixed
    ai_explanation_md: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class Probe(SQLModel, table=True):
    __tablename__ = "probes"
    id: Optional[int] = Field(default=None, primary_key=True)
    scan_id: int = Field(foreign_key="scans.id", index=True)
    finding_id: Optional[int] = Field(default=None, foreign_key="findings.id", index=True)
    label: str = ""
    identity: str = ""
    request_json_redacted: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))
    response_json_redacted: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))
    status: int = 0
    latency_ms: Optional[int] = None


class ScanEvent(SQLModel, table=True):
    __tablename__ = "scan_events"
    id: Optional[int] = Field(default=None, primary_key=True)
    scan_id: int = Field(foreign_key="scans.id", index=True)
    seq: int = 0
    type: str = ""
    payload_json: Any = Field(default_factory=dict, sa_column=Column(SA_JSON))
    created_at: datetime = Field(default_factory=_now)
