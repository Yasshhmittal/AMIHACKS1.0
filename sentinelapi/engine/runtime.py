"""Scan runtime: background execution, SSE event fan-out, and persistence.

The sweep runs in an asyncio task and streams events into an in-memory queue
(for live SSE) and a history list (for replay / polling fallback). On completion
the full result is written to SQLite.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlmodel import select

from .core.session import IdentitySession, vault
from .core.sweep import AccessMatrixSweep
from .db import get_session
from .ingest.api_model import NormalizedEndpoint
from .models.tables import (Endpoint, Finding, Identity, MatrixCell, Probe,
                            Scan, ScanEvent, Spec, Target)

logger = logging.getLogger("sentinel.runtime")

# scan_id -> live queue / event history / lightweight status
scan_queues: Dict[int, asyncio.Queue] = {}
scan_history: Dict[int, List[Dict[str, Any]]] = {}
scan_status: Dict[int, Dict[str, Any]] = {}


def _load_endpoints(spec_id: int) -> List[NormalizedEndpoint]:
    with get_session() as s:
        rows = s.exec(select(Endpoint).where(Endpoint.spec_id == spec_id)).all()
        eps = []
        for r in rows:
            ep = NormalizedEndpoint(
                method=r.method, path=r.path, operation_id=r.operation_id,
                summary=r.summary, spec_secured=r.spec_secured,
                object_bearing=r.object_bearing, admin_scoped=r.admin_scoped,
                path_params=list((r.params_json or {}).get("path_params", [])),
                documented_response_fields=set((r.response_fields_json or {}).get("fields", [])),
                owner_hint=(r.params_json or {}).get("owner_hint"),
            )
            ep.id = r.id
            eps.append(ep)
        return eps


def load_identities(target_id: int) -> Dict[str, IdentitySession]:
    with get_session() as s:
        rows = s.exec(select(Identity).where(Identity.target_id == target_id)).all()
        out: Dict[str, IdentitySession] = {}
        for r in rows:
            cred = None
            if r.credential_encrypted:
                try:
                    cred = vault.decrypt(r.credential_encrypted)
                except Exception:
                    cred = None
            out[r.label] = IdentitySession(r.label, r.role, r.user_id, cred)
        return out


def target_base_url(target_id: int) -> str:
    with get_session() as s:
        t = s.get(Target, target_id)
        return t.base_url if t else ""


async def run_scan(scan_id: int, target_id: int, spec_id: int, checks: List[str]) -> None:
    q = scan_queues.setdefault(scan_id, asyncio.Queue())
    scan_history.setdefault(scan_id, [])
    scan_status[scan_id] = {"status": "running", "phase": None, "requests_used": 0,
                            "findings_by_severity": {}, "started_at": datetime.now(timezone.utc).isoformat()}
    seq = {"n": 0}

    def emit(event_type: str, payload: Dict[str, Any]):
        seq["n"] += 1
        obj = {"seq": seq["n"], "type": event_type, "payload": payload}
        scan_history[scan_id].append(obj)
        if event_type == "phase.started":
            scan_status[scan_id]["phase"] = payload.get("phase")
        if event_type == "finding":
            sev = payload.get("severity", "INFO")
            scan_status[scan_id]["findings_by_severity"][sev] = \
                scan_status[scan_id]["findings_by_severity"].get(sev, 0) + 1
        try:
            q.put_nowait(obj)
        except Exception:
            pass

    endpoints = _load_endpoints(spec_id)
    identities = load_identities(target_id)
    base = target_base_url(target_id)

    with get_session() as s:
        scan = s.get(Scan, scan_id)
        if scan:
            scan.status = "running"
            scan.started_at = datetime.now(timezone.utc)
            s.add(scan)

    result: Optional[Dict[str, Any]] = None
    try:
        sweep = AccessMatrixSweep(base, endpoints, identities, checks=checks, event_callback=emit)
        result = await sweep.run()
    except Exception as exc:  # guard/other failure
        logger.exception("Scan %s failed", scan_id)
        emit("scan.completed", {"total_findings": 0, "total_requests": 0,
                                "duration_ms": 0, "risk_score": 0, "error": str(exc)})
        scan_status[scan_id]["status"] = "failed"

    if result is not None:
        _persist_result(scan_id, result)
        scan_status[scan_id].update({
            "status": "aborted" if result.get("aborted_reason") else "completed",
            "requests_used": result["requests_used"],
            "risk_score": result["risk_score"],
            "finished_at": datetime.now(timezone.utc).isoformat(),
        })
    # signal stream end
    try:
        q.put_nowait({"seq": seq["n"] + 1, "type": "_end", "payload": {}})
    except Exception:
        pass


def _persist_result(scan_id: int, result: Dict[str, Any]) -> None:
    with get_session() as s:
        scan = s.get(Scan, scan_id)
        if scan:
            scan.status = "aborted" if result.get("aborted_reason") else "completed"
            scan.requests_used = result["requests_used"]
            scan.duration_ms = result["duration_ms"]
            scan.risk_score = result["risk_score"]
            scan.finished_at = datetime.now(timezone.utc)
            s.add(scan)

        for cell in result["matrix_cells"]:
            s.add(MatrixCell(scan_id=scan_id, **{k: cell.get(k) for k in (
                "endpoint_id", "method", "path", "identity", "object_id", "object_owner",
                "status", "duration_ms", "ownership_mismatch", "undocumented_fields", "sensitive_fields")}))

        for f in result["findings"]:
            finding = Finding(
                scan_id=scan_id, fingerprint=f.fingerprint, finding_class=f.finding_class,
                owasp_id=f.owasp_id, severity=f.severity, risk_score=f.risk_score,
                confidence=f.confidence, title=f.title, impact=f.impact,
                remediation=f.remediation, score_factors_json=f.score_factors,
                expected=f.expected, actual=f.actual, endpoint=f.endpoint,
                vuln_id=f.vuln_id, state="open",
            )
            s.add(finding)
            s.flush()  # get finding.id
            for p in f.probes:
                s.add(Probe(scan_id=scan_id, finding_id=finding.id, label=p["label"],
                            identity=p["identity"], status=p["status"], latency_ms=p.get("latency_ms"),
                            request_json_redacted=p["request_json_redacted"],
                            response_json_redacted=p["response_json_redacted"]))

        for ev in scan_history.get(scan_id, []):
            s.add(ScanEvent(scan_id=scan_id, seq=ev["seq"], type=ev["type"], payload_json=ev["payload"]))
