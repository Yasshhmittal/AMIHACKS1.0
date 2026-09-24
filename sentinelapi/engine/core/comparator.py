"""Response comparator — the false-positive killer.

Core idea: a 200 is never a finding on its own. We prove ownership from the
response body, and we compare bodies only after canonicalising and pruning
volatile fields, so transient noise (timestamps, request ids) can't fabricate
or hide a match.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

SENSITIVE_NAME_PATTERNS = [
    "password", "passwordhash", "_hash", "salt", "secret", "token", "apikey",
    "privatekey", "ssn", "aadhaar", "cardnumber", "cvv", "otp", "internal",
    "adminflag", "refreshtoken", "sessionid", "credit_score", "creditscore",
    "internalnotes",
]
BCRYPT_RE = re.compile(r"^\$2[aby]\$")
JWT_RE = re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
ENVELOPE_KEYS = ("data", "items", "results", "result")


def canonicalize(body: Any) -> Any:
    """Recursively sort dict keys and coerce scalar ints/floats to strings so
    that 102 and "102" compare equal downstream."""
    if isinstance(body, dict):
        return {k: canonicalize(body[k]) for k in sorted(body.keys())}
    if isinstance(body, list):
        return [canonicalize(x) for x in body]
    if isinstance(body, bool):
        return body
    if isinstance(body, (int, float)):
        return str(body)
    return body


def unwrap_envelope(body: Any) -> Any:
    """Pull the payload out of common wrappers like {"data": {...}}."""
    if isinstance(body, dict):
        for key in ENVELOPE_KEYS:
            if key in body and len(body) <= 2:
                return body[key]
    return body


def flatten(body: Any, prefix: str = "") -> Dict[str, Any]:
    """Flatten nested structures to dotted paths, list items as items[]."""
    out: Dict[str, Any] = {}
    if isinstance(body, dict):
        for k, v in body.items():
            out.update(flatten(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(body, list):
        for item in body:
            out.update(flatten(item, f"{prefix}[]"))
    else:
        out[prefix] = body
    return out


def learn_volatility(resp_a: Any, resp_b: Any) -> Set[str]:
    """Two identical requests -> any field that differs is volatile."""
    fa, fb = flatten(canonicalize(resp_a)), flatten(canonicalize(resp_b))
    volatile: Set[str] = set()
    for key in set(fa) | set(fb):
        if fa.get(key) != fb.get(key):
            volatile.add(key)
    return volatile


def body_equivalent(r1: Any, r2: Any, volatile_fields: Optional[Set[str]] = None) -> bool:
    f1 = flatten(canonicalize(unwrap_envelope(r1)))
    f2 = flatten(canonicalize(unwrap_envelope(r2)))
    if volatile_fields:
        f1 = {k: v for k, v in f1.items() if k not in volatile_fields}
        f2 = {k: v for k, v in f2.items() if k not in volatile_fields}
    return f1 == f2


def find_owner_field(body: Any, hint: Optional[str] = None) -> Optional[str]:
    """Return the owner id (as a string) from a response body.

    Prefers the explicit hint field (from the spec's collection hints); falls
    back to common owner field names. Returns None when it can't be proven.
    """
    payload = unwrap_envelope(body)
    if isinstance(payload, list):
        payload = payload[0] if payload else {}
    if not isinstance(payload, dict):
        return None
    candidates = []
    if hint:
        candidates.append(hint)
    candidates += ["userId", "user_id", "ownerId", "owner_id", "owner", "accountId", "account_id"]
    lowered = {k.lower(): k for k in payload.keys()}
    for cand in candidates:
        real = lowered.get(cand.lower())
        if real is not None and payload[real] is not None:
            return str(payload[real])
    return None


def _looks_sensitive_value(value: Any) -> bool:
    if isinstance(value, str):
        if BCRYPT_RE.match(value) or JWT_RE.match(value):
            return True
    return False


def find_sensitive_fields(body: Any) -> List[str]:
    """Return flattened field paths whose NAME or VALUE looks sensitive."""
    if not isinstance(body, (dict, list)):
        return []
    flat = flatten(body)
    hits: List[str] = []
    for path, value in flat.items():
        leaf = path.split(".")[-1].replace("[]", "").lower()
        name_hit = any(pat in leaf for pat in SENSITIVE_NAME_PATTERNS)
        if name_hit or _looks_sensitive_value(value):
            hits.append(path)
    return sorted(set(hits))


def undocumented_fields(body: Any, documented: Set[str]) -> List[str]:
    """Field paths present in the response but absent from the response schema."""
    if not isinstance(body, (dict, list)):
        return []
    flat_leaves = {p.split(".")[-1].replace("[]", "") for p in flatten(body)}
    doc = {d.lower() for d in documented}
    return sorted({leaf for leaf in flat_leaves if leaf.lower() not in doc})
