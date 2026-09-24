from engine.core.risk_engine import calculate_severity
from engine.ingest.openapi_parser import resolve_spec_secured


def test_bola_factors_reach_critical():
    sev, score, _ = calculate_severity(
        ["auth_boundary_crossed", "cross_identity_data", "exploitable_low_priv", "repeat_verified"])
    assert sev == "CRITICAL"
    assert score >= 90


def test_hardening_gap_is_low():
    sev, score, _ = calculate_severity(["hardening_gap"])
    assert sev == "LOW"


def test_repeat_diverged_penalises():
    sev, score, _ = calculate_severity(["auth_boundary_crossed", "repeat_diverged"])
    assert score == 20  # 40 - 20


def test_security_empty_means_public():
    op = {"security": []}
    assert resolve_spec_secured(op, {}) is False


def test_operation_security_overrides_doc_default():
    op = {"security": [{"BearerAuth": []}]}
    assert resolve_spec_secured(op, {"security": []}) is True


def test_doc_default_applies_when_op_silent():
    assert resolve_spec_secured({}, {"security": [{"BearerAuth": []}]}) is True
    assert resolve_spec_secured({}, {}) is False
