"""Two-pass redaction. Applied before any request/response is stored, streamed
or shown to the LLM.

Rule: sensitive HEADER values and sensitive body VALUES are masked, but
sensitive body KEY NAMES are preserved — the presence of the name is the
finding.
"""
from __future__ import annotations

import copy
from typing import Any, Dict

from .comparator import SENSITIVE_NAME_PATTERNS, _looks_sensitive_value

REDACT = "***redacted***"
SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token"}
MAX_BODY_BYTES = 8 * 1024


def redact_headers(headers: Dict[str, str]) -> Dict[str, str]:
    return {k: (REDACT if k.lower() in SENSITIVE_HEADERS else v) for k, v in (headers or {}).items()}


def _redact_body(body: Any) -> Any:
    if isinstance(body, dict):
        out = {}
        for k, v in body.items():
            leaf = k.lower()
            if any(pat in leaf for pat in SENSITIVE_NAME_PATTERNS):
                out[k] = REDACT  # keep the key, mask the value
            else:
                out[k] = _redact_body(v)
        return out
    if isinstance(body, list):
        return [_redact_body(x) for x in body]
    if _looks_sensitive_value(body):
        return REDACT
    return body


def _truncate(body: Any) -> Any:
    import json
    try:
        raw = json.dumps(body)
    except (TypeError, ValueError):
        return body
    if len(raw.encode()) > MAX_BODY_BYTES:
        return {"_truncated": True, "_preview": raw[:MAX_BODY_BYTES]}
    return body


def redact_body(body: Any) -> Any:
    return _truncate(_redact_body(copy.deepcopy(body)))


def redact_request(method: str, url: str, headers: Dict[str, str], body: Any = None) -> Dict[str, Any]:
    out = {"method": method, "url": url, "headers": redact_headers(headers)}
    if body is not None:
        out["body"] = redact_body(body)
    return out


def redact_response(status: int, headers: Dict[str, str], body: Any) -> Dict[str, Any]:
    return {"status": status, "headers": redact_headers(headers), "body": redact_body(body)}
