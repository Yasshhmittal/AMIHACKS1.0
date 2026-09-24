import copy
import re
from typing import Any, Dict, List, Union

SENSITIVE_KEY_PATTERNS = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"passwd", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"apikey", re.IGNORECASE),
    re.compile(r"api_key", re.IGNORECASE),
    re.compile(r"private_key", re.IGNORECASE),
    re.compile(r"privatekey", re.IGNORECASE),
    re.compile(r"authorization", re.IGNORECASE),
    re.compile(r"credit_card", re.IGNORECASE),
    re.compile(r"cardnumber", re.IGNORECASE),
    re.compile(r"cvv", re.IGNORECASE),
    re.compile(r"ssn", re.IGNORECASE),
    re.compile(r"aadhaar", re.IGNORECASE),
    re.compile(r"otp", re.IGNORECASE),
    re.compile(r"salt", re.IGNORECASE),
    re.compile(r"hash", re.IGNORECASE)
]

REDACTED_PLACEHOLDER = "***redacted***"
MAX_BODY_BYTES = 8192  # 8 KB

def is_sensitive_key(key: str) -> bool:
    return any(p.search(key) for p in SENSITIVE_KEY_PATTERNS)

def redact_headers(headers: Dict[str, Any]) -> Dict[str, str]:
    """Redacts Authorization, Cookie, API keys in headers."""
    redacted = {}
    for k, v in headers.items():
        if k.lower() in {"authorization", "cookie", "set-cookie", "x-api-key", "x-token"}:
            redacted[k] = REDACTED_PLACEHOLDER
        else:
            redacted[k] = str(v)
    return redacted

def redact_body_values(data: Any) -> Any:
    """
    Recursively traverse JSON objects/arrays.
    Preserve key names (because the existence of 'passwordHash' is the finding!),
    but redact values of sensitive keys.
    """
    if isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            if is_sensitive_key(k):
                new_dict[k] = REDACTED_PLACEHOLDER
            else:
                new_dict[k] = redact_body_values(v)
        return new_dict
    elif isinstance(data, list):
        return [redact_body_values(item) for item in data]
    return data

def truncate_body(data: Any, max_bytes: int = MAX_BODY_BYTES) -> Any:
    """Ensure body does not exceed max_bytes."""
    import json
    try:
        serialized = json.dumps(data)
        if len(serialized.encode('utf-8')) > max_bytes:
            return {"_truncated": True, "preview": serialized[:max_bytes] + "... [TRUNCATED]"}
    except Exception:
        pass
    return data

def sanitize_evidence_bundle(bundle: Dict[str, Any]) -> Dict[str, Any]:
    """Applies complete two-pass redaction to an evidence bundle."""
    copied = copy.deepcopy(bundle)
    if "request" in copied:
        if "headers" in copied["request"]:
            copied["request"]["headers"] = redact_headers(copied["request"]["headers"])
        if "body" in copied["request"]:
            copied["request"]["body"] = truncate_body(redact_body_values(copied["request"]["body"]))
            
    if "response" in copied:
        if "headers" in copied["response"]:
            copied["response"]["headers"] = redact_headers(copied["response"]["headers"])
        if "body" in copied["response"]:
            copied["response"]["body"] = truncate_body(redact_body_values(copied["response"]["body"]))
            
    return copied
