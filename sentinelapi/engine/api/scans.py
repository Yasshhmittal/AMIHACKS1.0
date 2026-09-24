import asyncio
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import HTMLResponse
from sse_starlette.sse import EventSourceResponse
from typing import List, Optional, Dict, Any

from ..models.schemas import ScanCreate, ScanResponse, FindingResponse, MatrixCellModel, AISummaryResponse
from ..core.sweep import AccessMatrixSweep
from ..core.session import IdentitySession, vault
from ..ingest.openapi_parser import parse_openapi_spec
from ..ai.groq_provider import GroqProvider
from ..db import get_db

router = APIRouter(prefix="/api/scans", tags=["scans"])

# Global event queues & active scan results for SSE streaming
scan_event_queues: Dict[int, asyncio.Queue] = {}
scan_event_history: Dict[int, List[Dict[str, Any]]] = {}
scan_in_memory_results: Dict[int, Dict[str, Any]] = {}
ai_provider = GroqProvider()

async def run_scan_task(scan_id: int, target_url: str, spec_endpoints: list, identities_dict: dict):
    q = scan_event_queues.get(scan_id)
    seq = 0

    def event_emitter(event_type: str, payload: dict):
        nonlocal seq
        seq += 1
        event_obj = {"seq": seq, "type": event_type, "payload": payload}
        if scan_id in scan_event_history:
            scan_event_history[scan_id].append(event_obj)
        if q:
            try:
                q.put_nowait(event_obj)
            except Exception:
                pass

    sweep = AccessMatrixSweep(
        target_base_url=target_url,
        endpoints=spec_endpoints,
        identities=identities_dict,
        event_callback=event_emitter
    )

    results = await sweep.run()
    scan_in_memory_results[scan_id] = results

    # Persist in DB if available
    db = get_db()
    if db and db.is_connected():
        try:
            await db.scan.update(
                where={"id": scan_id},
                data={
                    "status": "completed",
                    "phase": "COMPLETED",
                    "requestsUsed": results["requests_used"],
                    "durationMs": results["duration_ms"],
                    "riskScore": results["risk_score"]
                }
            )
            # Create findings in DB
            for f in results["findings"]:
                db_finding = await db.finding.create(
                    data={
                        "scanId": scan_id,
                        "fingerprint": f.fingerprint,
                        "findingClass": f.finding_class,
                        "owaspId": f.owasp_id,
                        "severity": f.severity,
                        "riskScore": f.risk_score,
                        "confidence": f.confidence,
                        "title": f.title,
                        "impact": f.impact,
                        "remediation": f.remediation,
                        "scoreFactorsJson": json.dumps(f.score_factors),
                        "expected": f.expected,
                        "actual": f.actual,
                        "state": "open"
                    }
                )
                for pr in f.probes:
                    await db.probe.create(
                        data={
                            "scanId": scan_id,
                            "findingId": db_finding.id,
                            "label": pr["label"],
                            "identity": pr["identity"],
                            "status": pr["status"],
                            "latencyMs": pr["latency_ms"],
                            "requestJsonRedacted": json.dumps(pr["request_json_redacted"]),
                            "responseJsonRedacted": json.dumps(pr["response_json_redacted"])
                        }
                    )
        except Exception as e:
            print(f"Error persisting scan results to DB: {e}")

@router.post("", response_model=ScanResponse)
async def start_scan(payload: ScanCreate, background_tasks: BackgroundTasks):
    scan_id = len(scan_in_memory_results) + 1
    scan_event_queues[scan_id] = asyncio.Queue()
    scan_event_history[scan_id] = []

    target_url = "http://localhost:4000"
    spec_endpoints = []

    # Check database
    db = get_db()
    if db and db.is_connected():
        t = await db.target.find_unique(where={"id": payload.target_id})
        if t:
            target_url = t.baseUrl
        sp = await db.spec.find_unique(where={"id": payload.spec_id}, include={"endpoints": True})
        if sp:
            spec_dict = json.loads(sp.parsedJson) if isinstance(sp.parsedJson, str) else sp.parsedJson
            _, spec_endpoints = parse_openapi_spec(json.dumps(spec_dict))
    
    if not spec_endpoints:
        # Default to SentinelShop demo endpoints
        with open("sentinelshop/openapi.yaml", "r", encoding="utf-8") as f:
            _, spec_endpoints = parse_openapi_spec(f.read())

    # Standard sandbox test identities
    identities_dict = {
        "anonymous": IdentitySession("anonymous", "anonymous"),
        "userA": IdentitySession("userA", "user", user_id="1", raw_credential="token-alice-12345"),
        "userB": IdentitySession("userB", "user", user_id="2", raw_credential="token-bob-67890"),
        "admin": IdentitySession("admin", "admin", user_id="9", raw_credential="token-admin-99999")
    }

    # Launch scan in background task
    background_tasks.add_task(run_scan_task, scan_id, target_url, spec_endpoints, identities_dict)

    return ScanResponse(
        id=scan_id,
        target_id=payload.target_id,
        spec_id=payload.spec_id,
        status="running",
        phase="INVENTORY",
        requests_used=0
    )

@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan_status(scan_id: int):
    if scan_id in scan_in_memory_results:
        res = scan_in_memory_results[scan_id]
        return ScanResponse(
            id=scan_id,
            target_id=1,
            spec_id=1,
            status="completed",
            phase="COMPLETED",
            requests_used=res.get("requests_used", 0),
            duration_ms=res.get("duration_ms", 0),
            risk_score=res.get("risk_score", 0.0),
            total_findings=len(res.get("findings", []))
        )
    return ScanResponse(
        id=scan_id,
        target_id=1,
        spec_id=1,
        status="running",
        phase="CROSS",
        requests_used=35
    )

@router.get("/{scan_id}/stream")
async def stream_scan_events(scan_id: int):
    """
    Server-Sent Events (SSE) endpoint providing live sequence-numbered event streaming.
    """
    q = scan_event_queues.get(scan_id)
    if not q:
        q = asyncio.Queue()
        scan_event_queues[scan_id] = q

    async def event_generator():
        # Replay any past events first for replay-safety
        for past_ev in scan_event_history.get(scan_id, []):
            yield {
                "event": past_ev["type"],
                "id": str(past_ev["seq"]),
                "data": json.dumps(past_ev["payload"])
            }

        while True:
            try:
                ev = await asyncio.wait_for(q.get(), timeout=30.0)
                yield {
                    "event": ev["type"],
                    "id": str(ev["seq"]),
                    "data": json.dumps(ev["payload"])
                }
                if ev["type"] == "scan.completed":
                    break
            except asyncio.TimeoutError:
                # Keep-alive heartbeat comment
                yield {": ping\n\n"}

    return EventSourceResponse(event_generator())

@router.get("/{scan_id}/events")
async def get_polling_events(scan_id: int, after_seq: int = Query(0)):
    events = scan_event_history.get(scan_id, [])
    return [e for e in events if e["seq"] > after_seq]

@router.get("/{scan_id}/matrix", response_model=List[MatrixCellModel])
async def get_scan_matrix(scan_id: int):
    if scan_id in scan_in_memory_results:
        return [
            MatrixCellModel(
                scan_id=scan_id,
                endpoint_id=idx + 1,
                method=c.get("method"),
                path=c.get("path"),
                identity=c["identity"],
                object_id=c.get("object_id"),
                object_owner=c.get("object_owner"),
                status=c["status"],
                duration_ms=c.get("duration_ms"),
                ownership_mismatch=c.get("ownership_mismatch", False),
                undocumented_fields=c.get("undocumented_fields", []),
                sensitive_fields=c.get("sensitive_fields", [])
            )
            for idx, c in enumerate(scan_in_memory_results[scan_id].get("matrix_cells", []))
        ]
    return []

@router.get("/{scan_id}/findings", response_model=List[FindingResponse])
async def get_scan_findings(
    scan_id: int,
    severity: Optional[str] = None,
    finding_class: Optional[str] = Query(None, alias="class"),
    confidence: Optional[str] = None
):
    findings_list = []
    if scan_id in scan_in_memory_results:
        for idx, f in enumerate(scan_in_memory_results[scan_id].get("findings", [])):
            if severity and f.severity.upper() != severity.upper():
                continue
            if finding_class and f.finding_class.upper() != finding_class.upper():
                continue
            if confidence and f.confidence.upper() != confidence.upper():
                continue

            findings_list.append(FindingResponse(
                id=idx + 1,
                scan_id=scan_id,
                fingerprint=f.fingerprint,
                finding_class=f.finding_class,
                owasp_id=f.owasp_id,
                severity=f.severity,
                risk_score=f.risk_score,
                confidence=f.confidence,
                title=f.title,
                impact=f.impact,
                remediation=f.remediation,
                score_factors=[
                    {"description": factor, "weight": 20, "applied": True}
                    for factor in f.score_factors
                ],
                expected=f.expected,
                actual=f.actual,
                state="open"
            ))

    return findings_list

@router.get("/{scan_id}/summary", response_model=AISummaryResponse)
async def get_scan_summary(scan_id: int):
    res = scan_in_memory_results.get(scan_id, {})
    findings = res.get("findings", [])
    
    counts = {}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1

    summary_input = {
        "total_endpoints": 8,
        "total_requests": res.get("requests_used", 60),
        "findings_by_severity": counts,
        "risk_score": res.get("risk_score", 85.0)
    }

    summary_text = await ai_provider.summarize(summary_input)
    return AISummaryResponse(
        scan_id=scan_id,
        summary_text=summary_text,
        source="groq" if ai_provider.fast_llm else "template_fallback"
    )

@router.get("/{scan_id}/report", response_class=HTMLResponse)
async def get_printable_report(scan_id: int):
    res = scan_in_memory_results.get(scan_id, {})
    findings = res.get("findings", [])
    
    rows = ""
    for f in findings:
        badge_color = "#dc2626" if f.severity == "CRITICAL" else "#ea580c" if f.severity == "HIGH" else "#ca8a04"
        rows += f"""
        <div style="border: 1px solid #334155; margin-bottom: 20px; padding: 15px; border-radius: 6px; background: #0f172a;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #f8fafc;">{f.title}</h3>
                <span style="background: {badge_color}; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">{f.severity}</span>
            </div>
            <p style="color: #94a3b8; font-family: monospace; margin: 8px 0;">{f.endpoint_method} {f.endpoint_path} · {f.owasp_id}</p>
            <p style="color: #cbd5e1; font-size: 14px;"><strong>Impact:</strong> {f.impact}</p>
            <p style="color: #38bdf8; font-size: 14px;"><strong>Remediation:</strong> {f.remediation}</p>
        </div>
        """

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>SentinelAPI Security Audit Report</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #020617; color: #f8fafc; padding: 40px; }}
        h1 {{ font-size: 28px; margin-bottom: 5px; }}
        .header {{ border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }}
        .meta {{ color: #94a3b8; font-size: 14px; }}
        @media print {{ body {{ background: #fff; color: #000; }} }}
    </style>
</head>
<body>
    <div class="header">
        <h1>SentinelAPI Zero-Trust Security Audit Report</h1>
        <div class="meta">Scan #{scan_id} · Generated for Security & Engineering Teams</div>
    </div>
    <h2>Executive Findings ({len(findings)} Total Identified)</h2>
    {rows}
</body>
</html>"""
    return HTMLResponse(content=html)
