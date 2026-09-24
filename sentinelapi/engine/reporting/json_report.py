"""Assemble a full JSON report for a scan from persisted rows."""
from __future__ import annotations

from typing import Any, Dict

from sqlmodel import select

from ..db import get_session
from ..models.tables import Finding, MatrixCell, Probe, Scan, Spec, Target


def build_report(scan_id: int) -> Dict[str, Any]:
    with get_session() as s:
        scan = s.get(Scan, scan_id)
        if not scan:
            return {}
        target = s.get(Target, scan.target_id)
        spec = s.get(Spec, scan.spec_id)
        findings = s.exec(select(Finding).where(Finding.scan_id == scan_id)).all()
        cells = s.exec(select(MatrixCell).where(MatrixCell.scan_id == scan_id)).all()

        by_sev: Dict[str, int] = {}
        by_class: Dict[str, int] = {}
        f_out = []
        for f in findings:
            by_sev[f.severity] = by_sev.get(f.severity, 0) + 1
            by_class[f.finding_class] = by_class.get(f.finding_class, 0) + 1
            probes = s.exec(select(Probe).where(Probe.finding_id == f.id)).all()
            f_out.append({
                "id": f.id, "class": f.finding_class, "owasp_id": f.owasp_id,
                "severity": f.severity, "confidence": f.confidence, "risk_score": f.risk_score,
                "title": f.title, "endpoint": f.endpoint, "impact": f.impact,
                "remediation": f.remediation, "expected": f.expected, "actual": f.actual,
                "state": f.state, "score_factors": f.score_factors_json,
                "probes": [{"label": p.label, "identity": p.identity, "status": p.status,
                            "request": p.request_json_redacted, "response": p.response_json_redacted}
                           for p in probes],
            })
        return {
            "scan": {"id": scan.id, "status": scan.status, "requests_used": scan.requests_used,
                     "duration_ms": scan.duration_ms, "risk_score": scan.risk_score,
                     "started_at": scan.started_at.isoformat() if scan.started_at else None,
                     "finished_at": scan.finished_at.isoformat() if scan.finished_at else None},
            "target": {"base_url": target.base_url if target else None,
                       "environment": target.environment if target else None},
            "spec": {"endpoint_count": spec.endpoint_count if spec else 0},
            "summary": {"total_findings": len(findings), "findings_by_severity": by_sev,
                        "findings_by_class": by_class, "risk_score": scan.risk_score,
                        "total_requests": scan.requests_used,
                        "total_endpoints": spec.endpoint_count if spec else 0},
            "findings": f_out,
            "matrix": [{"path": c.path, "method": c.method, "identity": c.identity,
                        "status": c.status, "ownership_mismatch": c.ownership_mismatch,
                        "sensitive_fields": c.sensitive_fields} for c in cells],
        }
