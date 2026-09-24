"""SARIF 2.1.0 export → GitHub Security tab."""
from __future__ import annotations

from typing import Any, Dict

SEV_TO_SARIF = {"CRITICAL": "error", "HIGH": "error", "MEDIUM": "warning",
                "LOW": "note", "INFO": "note"}


def build_sarif(report: Dict[str, Any]) -> Dict[str, Any]:
    rules, results = {}, []
    for f in report.get("findings", []):
        rule_id = f["class"]
        if rule_id not in rules:
            rules[rule_id] = {
                "id": rule_id,
                "name": rule_id.title().replace("_", ""),
                "shortDescription": {"text": f["title"]},
                "helpUri": f"https://owasp.org/API-Security/editions/2023/en/0x{f.get('owasp_id','')[:4]}/",
                "properties": {"security-severity": str(f.get("risk_score", 0) / 10)},
            }
        method, _, path = (f.get("endpoint") or "GET /").partition(" ")
        results.append({
            "ruleId": rule_id,
            "level": SEV_TO_SARIF.get(f["severity"], "warning"),
            "message": {"text": f"{f['title']} — {f.get('impact','')}"},
            "locations": [{"physicalLocation": {
                "artifactLocation": {"uri": path or "/"},
                "region": {"startLine": 1}}}],
            "properties": {"severity": f["severity"], "confidence": f["confidence"],
                           "owasp": f.get("owasp_id")},
        })
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "SentinelAPI", "version": "1.0.0",
                                "informationUri": "https://github.com/",
                                "rules": list(rules.values())}},
            "results": results,
        }],
    }
