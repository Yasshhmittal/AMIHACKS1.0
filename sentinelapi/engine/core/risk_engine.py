"""Transparent additive severity rubric. Every factor that fires is shown in the
UI's "Why this severity" panel. This is SentinelAPI's internal rubric — not CVSS.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

# key -> (human description, weight)
RUBRIC_WEIGHTS: Dict[str, Tuple[str, int]] = {
    "auth_boundary_crossed":      ("Authorization boundary crossed", 40),
    "cross_identity_data":        ("Cross-identity private data returned", 30),
    "admin_reachable_low_priv":   ("Administrative function reachable by low-priv user", 20),
    "credential_material":        ("Credential material in response (hash/secret/token)", 45),
    "sensitive_field_names":      ("Sensitive field names present in response", 20),
    "exploitable_low_priv":       ("Exploitable by low-privilege authenticated user", 10),
    "exploitable_anon":           ("Exploitable with no credentials at all", 15),
    "state_changing":             ("State-changing method succeeded", 10),
    "auth_no_throttle":           ("Auth endpoint lacks throttling", 40),
    "hardening_gap":              ("Hardening gap (headers / CORS / debug exposure)", 20),
    "undocumented_only":          ("Undocumented behavior only, no data impact", 5),
    "repeat_verified":            ("Repeat verification succeeded", 10),
    "repeat_diverged":            ("Repeat verification diverged", -20),
}


def calculate_severity(factor_keys: List[str]) -> Tuple[str, float, List[dict]]:
    """Return (severity, score, score_factors[]) — score_factors includes both
    applied and unapplied factors for full transparency in the UI."""
    applied = set(factor_keys)
    score = sum(RUBRIC_WEIGHTS[k][1] for k in applied if k in RUBRIC_WEIGHTS)
    score = max(0, min(100, score))

    if score >= 90:
        severity = "CRITICAL"
    elif score >= 70:
        severity = "HIGH"
    elif score >= 40:
        severity = "MEDIUM"
    elif score >= 20:
        severity = "LOW"
    else:
        severity = "INFO"

    factors = []
    for key, (desc, weight) in RUBRIC_WEIGHTS.items():
        if key in applied:
            factors.append({"description": desc, "weight": weight, "applied": True})
    # keep applied factors first, then show the ones that did not fire
    for key, (desc, weight) in RUBRIC_WEIGHTS.items():
        if key not in applied:
            factors.append({"description": desc, "weight": weight, "applied": False})
    return severity, float(score), factors
