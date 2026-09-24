"""AI/template summary + report export (JSON / HTML / SARIF)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Header, HTTPException, Response
from fastapi.responses import JSONResponse

from ..ai import get_ai_provider
from ..models.schemas import SummaryResponse
from ..reporting.json_report import build_report
from ..reporting.sarif import build_sarif

router = APIRouter(prefix="/api/scans", tags=["reports"])


@router.get("/{scan_id}/summary", response_model=SummaryResponse)
async def get_summary(scan_id: int):
    report = build_report(scan_id)
    if not report:
        raise HTTPException(status_code=404, detail="Scan not found")
    summ = report["summary"]
    provider = get_ai_provider()
    text = await provider.summarize({
        "total_endpoints": summ["total_endpoints"], "total_requests": summ["total_requests"],
        "total_findings": summ["total_findings"], "findings_by_severity": summ["findings_by_severity"],
        "findings_by_class": summ["findings_by_class"], "risk_score": summ["risk_score"]})
    return SummaryResponse(scan_id=scan_id, text=text, provider=provider.name,
                           total_endpoints=summ["total_endpoints"], total_requests=summ["total_requests"],
                           findings_by_severity=summ["findings_by_severity"],
                           findings_by_class=summ["findings_by_class"], risk_score=summ["risk_score"])


@router.get("/{scan_id}/report")
async def get_report(scan_id: int, accept: str = Header("application/json")):
    report = build_report(scan_id)
    if not report:
        raise HTTPException(status_code=404, detail="Scan not found")
    if "sarif" in accept:
        return JSONResponse(build_sarif(report),
                            headers={"Content-Disposition": f"attachment; filename=sentinel-scan-{scan_id}.sarif"})
    return JSONResponse(report,
                        headers={"Content-Disposition": f"attachment; filename=sentinel-scan-{scan_id}.json"})
