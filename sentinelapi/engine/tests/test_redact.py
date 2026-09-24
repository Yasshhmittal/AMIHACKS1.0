import pytest
from engine.core.redact import redact_headers, redact_body_values, is_sensitive_key

def test_is_sensitive_key():
    assert is_sensitive_key("password")
    assert is_sensitive_key("token")
    assert is_sensitive_key("api_key")
    assert is_sensitive_key("credit_card")
    assert not is_sensitive_key("username")
    assert not is_sensitive_key("email")

def test_redact_headers():
    headers = {
        "Authorization": "Bearer token-12345",
        "Content-Type": "application/json",
        "X-Api-Key": "secret-key-999"
    }
    redacted = redact_headers(headers)
    assert redacted["Authorization"] == "***redacted***"
    assert redacted["X-Api-Key"] == "***redacted***"
    assert redacted["Content-Type"] == "application/json"

def test_redact_body_preserves_keys():
    body = {
        "id": 1,
        "username": "alice",
        "passwordHash": "$2b$12$secretpassword",
        "nested": {"token": "secret_session_token"}
    }
    redacted = redact_body_values(body)
    assert "passwordHash" in redacted
    assert redacted["passwordHash"] == "***redacted***"
    assert redacted["nested"]["token"] == "***redacted***"
    assert redacted["username"] == "alice"
