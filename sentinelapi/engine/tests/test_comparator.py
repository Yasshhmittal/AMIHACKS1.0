from engine.core.comparator import (body_equivalent, canonicalize,
                                     find_owner_field, find_sensitive_fields,
                                     learn_volatility, undocumented_fields,
                                     unwrap_envelope)


def test_scalar_ids_compare_as_strings():
    # 102 (int) and "102" (str) must be treated as equal
    assert canonicalize({"id": 102}) == canonicalize({"id": "102"})


def test_body_equivalent_ignores_volatile():
    a = {"id": 1, "ts": "2026-01-01T00:00:00Z"}
    b = {"id": 1, "ts": "2026-01-01T00:00:09Z"}
    volatile = learn_volatility(a, b)
    assert "ts" in volatile
    assert body_equivalent(a, b, volatile)


def test_unwrap_envelope():
    assert unwrap_envelope({"data": {"id": 5}}) == {"id": 5}
    assert unwrap_envelope({"items": [1, 2]}) == [1, 2]


def test_find_owner_field_hint_first():
    body = {"id": 102, "userId": 2, "item": "x"}
    assert find_owner_field(body, hint="userId") == "2"


def test_find_owner_field_returns_none_when_absent():
    assert find_owner_field({"item": "x"}, hint="userId") is None


def test_find_sensitive_fields_by_name_and_value():
    body = {"username": "bob", "passwordHash": "$2b$12$abc", "creditScore": 700}
    hits = find_sensitive_fields(body)
    assert "passwordHash" in hits
    assert "creditScore" in hits
    assert "username" not in hits


def test_undocumented_fields():
    body = {"id": 1, "email": "x@y.z", "internalNotes": "secret"}
    documented = {"id", "email"}
    assert undocumented_fields(body, documented) == ["internalNotes"]
