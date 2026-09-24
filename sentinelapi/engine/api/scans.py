"""Scan lifecycle: create, status, SSE stream, polling fallback, matrix, findings list."""
from __future__ import annotations

import asyncio
import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select
from sse_starlette.sse import EventSourceResponse

from ..db import get_session
from ..models.schemas import (FindingResponse, MatrixCellModel, ScanCreate,
                              ScanResponse)
from ..models.tables import Finding, MatrixCell, Scan, Spec, Target
from ..runtime import run_scan, scan_history, scan_queues, scan_status
from .findings import finding_to_response

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("", response_model=ScanResponse)
async def create_scan(body: ScanCreate):
    with get_session() as s:
        if not s.get(Target, body.target_id):
            raise HTTPException(status_code=404, detail="Target not found")
        if not s.get(Spec, body.spec_id):
            raise HTTPException(status_code=404, detail="Spec not found")
        scan = Scan(target_id=body.target_id, spec_id=body.spec_id, status="pending",
                    config_json={"checks": body.checks})
        s.add(scan)
        s.flush()
        scan_id = scan.id
        resp = ScanResponse(id=scan.id, target_id=scan.target_id, spec_id=scan.spec_id,
                            status="pending")
    scan_queues[scan_id] = asyncio.Queue()
    scan_history[scan_id] = []
    asyncio.create_task(run_scan(scan_id, body.target_id, body.spec_id, body.checks))
    return resp


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(scan_id: int):
    with get_session() as s:
        scan = s.get(Scan, scan_id)
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")
        findings = s.exec(select(Finding).where(Finding.scan_id == scan_id)).all()
        
        live = scan_status.get(scan_id, {})
        by_sev: dict = {}
        for f in findings:
            by_sev[f.severity] = by_sev.get(f.severity, 0) + 1
        if not by_sev:
            by_sev = live.get("findings_by_severity", {})
            
        return ScanResponse(
            id=scan.id, target_id=scan.target_id, spec_id=scan.spec_id,
            status=live.get("status", scan.status), phase=live.get("phase", scan.phase),
            requests_used=scan.requests_used or live.get("requests_used", 0),
            duration_ms=scan.duration_ms, risk_score=scan.risk_score,
            started_at=scan.started_at.isoformat() if scan.started_at else live.get("started_at"),
            finished_at=scan.finished_at.isoformat() if scan.finished_at else None,
            total_findings=len(findings) or sum(by_sev.values()),
            findings_by_severity=by_sev)


@router.get("/{scan_id}/stream")
async def stream_scan(scan_id: int):
    if scan_id not in scan_queues and scan_id not in scan_history:
        raise HTTPException(status_code=404, detail="Scan not found")

    async def gen():
        # replay anything already emitted (reconnect-safe)
        for ev in list(scan_history.get(scan_id, [])):
            yield {"event": ev["type"], "id": str(ev["seq"]), "data": json.dumps(ev)}
        q = scan_queues.get(scan_id)
        if not q:
            return
        while True:
            try:
                ev = await asyncio.wait_for(q.get(), timeout=30)
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": "{}"}
                continue
            if ev.get("type") == "_end":
                yield {"event": "scan.stream.end", "data": "{}"}
                break
            yield {"event": ev["type"], "id": str(ev["seq"]), "data": json.dumps(ev)}

    return EventSourceResponse(gen())


@router.get("/{scan_id}/events")
async def poll_events(scan_id: int, after_seq: int = Query(0)):
    hist = scan_history.get(scan_id)
    if hist is None:
        with get_session() as s:
            from ..models.tables import ScanEvent
            rows = s.exec(select(ScanEvent).where(ScanEvent.scan_id == scan_id)
                          .where(ScanEvent.seq > after_seq).order_by(ScanEvent.seq)).all()
            return {"events": [{"seq": r.seq, "type": r.type, "payload": r.payload_json} for r in rows]}
    return {"events": [e for e in hist if e["seq"] > after_seq]}


@router.get("/{scan_id}/matrix", response_model=List[MatrixCellModel])
async def get_matrix(scan_id: int):
    with get_session() as s:
        rows = s.exec(select(MatrixCell).where(MatrixCell.scan_id == scan_id)).all()
        return [MatrixCellModel(
            id=r.id, scan_id=r.scan_id, endpoint_id=r.endpoint_id, method=r.method,
            path=r.path, identity=r.identity, object_id=r.object_id, object_owner=r.object_owner,
            status=r.status, duration_ms=r.duration_ms, ownership_mismatch=r.ownership_mismatch,
            undocumented_fields=r.undocumented_fields or [], sensitive_fields=r.sensitive_fields or [])
            for r in rows]


@router.get("/{scan_id}/findings", response_model=List[FindingResponse])
async def list_findings(scan_id: int, severity: Optional[str] = None,
                        finding_class: Optional[str] = Query(None, alias="class"),
                        confidence: Optional[str] = None):
    sev_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    with get_session() as s:
        q = select(Finding).where(Finding.scan_id == scan_id)
        if severity:
            q = q.where(Finding.severity == severity.upper())
        if finding_class:
            q = q.where(Finding.finding_class == finding_class)
        if confidence:
            q = q.where(Finding.confidence == confidence.upper())
        rows = s.exec(q).all()
        rows.sort(key=lambda r: (sev_rank.get(r.severity, 9), -r.risk_score))
        return [finding_to_response(r, s, include_probes=False) for r in rows]
