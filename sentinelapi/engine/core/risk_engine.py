from typing import List, Dict, Tuple, Any

RUBRIC_WEIGHTS = {
    "auth_boundary_crossed": ("Authorization boundary crossed", 40),
    "cross_identity_data": ("Cross-identity private data returned", 30),
    "admin_reachable_by_low_priv": ("Administrative function reachable by low-priv user", 20),
    "credential_material_leaked": ("Credential material in response (hash/secret/token)", 30),
    "sensitive_field_names": ("Sensitive field names present in response", 20),
    "exploitable_low_priv": ("Exploitable by low-privilege authenticated user", 10),
    "exploitable_anonymous": ("Exploitable with no credentials at all", 15),
    "state_changing_method": ("State-changing method succeeded", 10),
    "missing_throttling": ("Auth endpoint lacks throttling", 40),
    "hardening_gap": ("Hardening gap (headers / CORS / debug exposure)", 20),
    "undocumented_behavior_only": ("Undocumented behavior only, no data impact", 5),
    "repeat_verified": ("Repeat verification succeeded", 10),
    "repeat_diverged": ("Repeat verification diverged", -20)
}

def calculate_severity(active_factor_keys: List[str]) -> Tuple[str, float, List[Dict[str, Any]]]:
    """
    Computes total score and assigns severity label based on the transparent rubric.
    Returns (severity_label, score, score_factors_list).
    """
    score = 0
    factors_list = []

    for key, (description, weight) in RUBRIC_WEIGHTS.items():
        applied = key in active_factor_keys
        if applied:
            score += weight
        factors_list.append({
            "key": key,
            "description": description,
            "weight": weight,
            "applied": applied
        })

    # Clamp score between 0 and 100
    clamped_score = max(0.0, min(100.0, float(score)))

    if clamped_score >= 90:
        severity = "CRITICAL"
    elif clamped_score >= 70:
        severity = "HIGH"
    elif clamped_score >= 40:
        severity = "MEDIUM"
    elif clamped_score >= 20:
        severity = "LOW"
    else:
        severity = "INFO"

    return severity, clamped_score, factors_list
