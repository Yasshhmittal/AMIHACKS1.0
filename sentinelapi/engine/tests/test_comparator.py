import pytest
from engine.core.comparator import (
    canonicalize,
    unwrap_envelope,
    find_owner_field,
    find_sensitive_fields,
    body_equivalent,
    normalize_scalar
)

def test_normalize_scalar():
    assert normalize_scalar(102) == "102"
    assert normalize_scalar("102") == "102"
    assert normalize_scalar('"102"') == "102"
    assert normalize_scalar(None) is None

def test_canonicalize_sorts_keys():
    d1 = {"b": 2, "a": 1}
    d2 = {"a": 1, "b": 2}
    assert canonicalize(d1) == canonicalize(d2)

def test_unwrap_envelope():
    assert unwrap_envelope({"data": {"id": 1}}) == {"id": 1}
    assert unwrap_envelope({"items": [1, 2]}) == [1, 2]
    assert unwrap_envelope({"a": 1, "b": 2}) == {"a": 1, "b": 2}

def test_find_owner_field_hint():
    body = {"id": 102, "userId": 2, "item": "Cyberpunk Hoodie"}
    owner = find_owner_field(body, hint="userId")
    assert owner == "2"

def test_find_owner_field_heuristic():
    body = {"id": 102, "owner_id": 99, "item": "Monitor"}
    owner = find_owner_field(body)
    assert owner == "99"

def test_find_sensitive_fields():
    body = {
        "id": 1,
        "username": "alice",
        "passwordHash": "$2b$12$e8Y6k8l9alicepasswordhashsalt999",
        "creditScore": 780
    }
    found = find_sensitive_fields(body)
    assert any("passwordHash" in f for f in found)
    assert any("creditScore" in f for f in found)

def test_body_equivalent_ignoring_volatility():
    b1 = {"id": 101, "item": "Shoes", "timestamp": "2026-09-24T12:00:00Z"}
    b2 = {"id": 101, "item": "Shoes", "timestamp": "2026-09-24T12:05:00Z"}
    assert body_equivalent(b1, b2)
