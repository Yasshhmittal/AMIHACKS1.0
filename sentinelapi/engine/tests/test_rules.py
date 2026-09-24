import pytest
from engine.ingest.openapi_parser import resolve_spec_secured
from engine.core.risk_engine import calculate_severity
from engine.core.evidence import generate_fingerprint

def test_resolve_spec_secured():
    # Global secured, operation default -> True
    spec = {"security": [{"BearerAuth": []}]}
    op = {}
    assert resolve_spec_secured(op, spec) is True

    # Global secured, operation explicitly public (security: []) -> False
    op_public = {"security": []}
    assert resolve_spec_secured(op_public, spec) is False

    # Global unsecured, operation secured -> True
    spec_unsecured = {}
    op_secured = {"security": [{"BearerAuth": []}]}
    assert resolve_spec_secured(op_secured, spec_unsecured) is True

def test_severity_rubric_calculation():
    # BOLA factors: 40 + 30 + 10 + 10 = 90 -> CRITICAL
    factors = ["auth_boundary_crossed", "cross_identity_data", "exploitable_low_priv", "repeat_verified"]
    severity, score, _ = calculate_severity(factors)
    assert severity == "CRITICAL"
    assert score == 90.0

    # Misconfig factor: 20 + 10 = 30 -> LOW
    factors_low = ["hardening_gap", "repeat_verified"]
    severity_low, score_low, _ = calculate_severity(factors_low)
    assert severity_low == "LOW"
    assert score_low == 30.0

def test_generate_fingerprint_deterministic():
    fp1 = generate_fingerprint("http://localhost:4000", "BOLA", "getOrder", "102", "user")
    fp2 = generate_fingerprint("http://localhost:4000", "BOLA", "getOrder", "102", "user")
    assert fp1 == fp2
    assert len(fp1) == 16
