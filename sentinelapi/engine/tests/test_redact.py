from engine.core.redact import (REDACT, redact_body, redact_headers,
                                 redact_request, redact_response)


def test_headers_redacted():
    out = redact_headers({"Authorization": "Bearer secret", "Accept": "application/json"})
    assert out["Authorization"] == REDACT
    assert out["Accept"] == "application/json"


def test_body_keeps_key_masks_value():
    out = redact_body({"username": "bob", "passwordHash": "$2b$12$abc"})
    assert "passwordHash" in out          # key preserved (that's the finding)
    assert out["passwordHash"] == REDACT  # value masked
    assert out["username"] == "bob"


def test_bcrypt_value_masked_even_without_sensitive_name():
    out = redact_body({"blob": "$2b$12$abcdefghijk"})
    assert out["blob"] == REDACT


def test_request_and_response_shapes():
    req = redact_request("GET", "http://t/x", {"Cookie": "s=1"})
    assert req["headers"]["Cookie"] == REDACT
    res = redact_response(200, {"Set-Cookie": "s=1"}, {"token": "abc"})
    assert res["headers"]["Set-Cookie"] == REDACT
    assert res["body"]["token"] == REDACT
