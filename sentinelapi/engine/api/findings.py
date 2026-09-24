"""Finding detail, PoC, AI explain, and re-verify (re-runs the REAL test)."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from sqlmodel import Session, select

from ..ai import get_ai_provider
from ..core.evidence import build_pocs
from ..core.executor import HttpExecutor
from ..core.guard import SafetyGuard
from ..db import get_session
from ..models.schemas import (ExplainResponse, FindingResponse, PoCResponse,
                              ProbeModel, ReverifyResponse, ScoreFactor)
from ..models.tables import Finding, Probe, Scan, Target
from ..runtime import load_identities

router = APIRouter(prefix="/api/findings", tags=["findings"])


def finding_to_response(row: Finding, session: Session, include_probes: bool = True) -> FindingResponse:
    factors = [ScoreFactor(**sf) for sf in (row.score_factors_json or [])]
    probes: Optional[List[ProbeModel]] = None
    if include_probes:
        prows = session.exec(select(Probe).where(Probe.finding_id == row.id)).all()
        probes = [ProbeModel(id=p.id, label=p.label, identity=p.identity, status=p.status,
                             latency_ms=p.latency_ms, request_json_redacted=p.request_json_redacted,
                             response_json_redacted=p.response_json_redacted) for p in prows]
    return FindingResponse(
        id=row.id, scan_id=row.scan_id, fingerprint=row.fingerprint,
        finding_class=row.finding_class, owasp_id=row.owasp_id, severity=row.severity,
        risk_score=row.risk_score, confidence=row.confidence, title=row.title,
        impact=row.impact, remediation=row.remediation, score_factors=factors,
        expected=row.expected, actual=row.actual, endpoint=row.endpoint,
        vuln_id=row.vuln_id, state=row.state, ai_explanation_md=row.ai_explanation_md,
        probes=probes)


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(finding_id: int):
    with get_session() as s:
        row = s.get(Finding, finding_id)
        if not row:
            raise HTTPException(status_code=404, detail="Finding not found")
        return finding_to_response(row, s, include_probes=True)


@router.get("/{finding_id}/poc", response_model=PoCResponse)
async def get_poc(finding_id: int):
    with get_session() as s:
        row = s.get(Finding, finding_id)
        if not row:
            raise HTTPException(status_code=404, detail="Finding not found")
        method, path = (row.endpoint or "GET /").split(" ", 1) if row.endpoint else ("GET", "/")
        scan = s.get(Scan, row.scan_id)
        target = s.get(Target, scan.target_id) if scan else None
        base = target.base_url if target else "http://sentinelshop:4000"
        url = f"{base}{path}"
        pocs = build_pocs(method, url)
        return PoCResponse(finding_id=finding_id, **pocs)


@router.post("/{finding_id}/explain", response_model=ExplainResponse)
async def explain_finding(finding_id: int):
    with get_session() as s:
        row = s.get(Finding, finding_id)
        if not row:
            raise HTTPException(status_code=404, detail="Finding not found")
        if row.ai_explanation_md:
            return ExplainResponse(finding_id=finding_id, explanation_md=row.ai_explanation_md,
                                   provider="cached")
        payload = {"finding_class": row.finding_class, "owasp_id": row.owasp_id,
                   "endpoint": row.endpoint, "severity": row.severity,
                   "expected": row.expected, "actual": row.actual, "impact": row.impact}
    provider = get_ai_provider()
    text = await provider.explain(payload)
    with get_session() as s:
        row = s.get(Finding, finding_id)
        row.ai_explanation_md = text
        s.add(row)
    return ExplainResponse(finding_id=finding_id, explanation_md=text, provider=provider.name)


@router.post("/{finding_id}/verify", response_model=ReverifyResponse)
async def reverify_finding(finding_id: int):
    """Re-execute the decisive request against the LIVE target. Never cached —
    this is the product's central claim."""
    with get_session() as s:
        row = s.get(Finding, finding_id)
        if not row:
            raise HTTPException(status_code=404, detail="Finding not found")
        scan = s.get(Scan, row.scan_id)
        target = s.get(Target, scan.target_id)
        base = target.base_url
        # find the decisive probe (P2 attack; else the first probe)
        probes = s.exec(select(Probe).where(Probe.finding_id == finding_id)).all()
        decisive = next((p for p in probes if p.label == "P2"), probes[0] if probes else None)
        finding_class = row.finding_class
        identities = load_identities(scan.target_id)

    if not decisive:
        raise HTTPException(status_code=400, detail="No probe evidence to re-verify")

    method = decisive.request_json_redacted.get("method", "GET")
    url = decisive.request_json_redacted.get("url", "")
    ident = identities.get(decisive.identity)
    headers = ident.get_auth_headers() if ident else {}

    guard = SafetyGuard(base)
    executor = HttpExecutor(guard)
    try:
        res = await executor.execute(method, url, headers=headers)
    finally:
        await executor.close()

    # decide fixed vs still-vulnerable per class
    if finding_class in ("BOLA", "BFLA", "BROKEN_AUTH"):
        fixed = res.status in (401, 403) or not res.ok
    elif finding_class == "EXCESSIVE_DATA_EXPOSURE":
        from ..core.comparator import find_sensitive_fields
        fixed = not find_sensitive_fields(res.body)
    elif finding_class == "RATE_LIMITING":
        fixed = res.status == 429
    elif finding_class == "MISCONFIGURATION":
        fixed = not res.ok
    else:
        fixed = not res.ok

    status = "fixed" if fixed else "still-vulnerable"
    with get_session() as s:
        row = s.get(Finding, finding_id)
        row.state = "fixed" if fixed else "open"
        s.add(row)
    detail = (f"Re-ran {method} {url} live → HTTP {res.status}. "
              + ("Authorization now enforced." if fixed else "Still returns protected data."))
    return ReverifyResponse(finding_id=finding_id, status=status, detail=detail)
