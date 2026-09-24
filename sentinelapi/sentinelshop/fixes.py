"""Runtime fix toggles. Flipping one to True makes the matching endpoint enforce
the correct check, which powers the scan -> fix -> re-verify demo loop."""
from __future__ import annotations

from typing import Dict

DEFAULT_FIXES: Dict[str, bool] = {
    "FIX_BOLA_ORDERS": False,         # V1: order owner check
    "FIX_BOLA_USERS": False,          # V2: profile id check
    "FIX_BFLA_ADMIN": False,          # V3: admin role check
    "FIX_EXPOSURE_ME": False,         # V4: strip sensitive fields
    "FIX_AUTH_INVOICES": False,       # V5: require auth on /invoices
    "FIX_RATELIMIT": False,           # V6: throttle /auth/login
    "FIX_MISCONFIG": False,           # V7: headers + CORS + hide /debug
    "FIX_BOLA_ORDERS_DELETE": False,  # V8: delete owner check
}

# Maps a scanner vuln_id / finding class token to the fix flag it toggles.
VULN_TO_FIX: Dict[str, str] = {
    "V1": "FIX_BOLA_ORDERS", "BOLA_ORDERS": "FIX_BOLA_ORDERS",
    "V2": "FIX_BOLA_USERS", "BOLA_USERS": "FIX_BOLA_USERS",
    "V3": "FIX_BFLA_ADMIN", "BFLA_ADMIN": "FIX_BFLA_ADMIN",
    "V4": "FIX_EXPOSURE_ME", "EXPOSURE_ME": "FIX_EXPOSURE_ME",
    "V5": "FIX_AUTH_INVOICES", "AUTH_INVOICES": "FIX_AUTH_INVOICES",
    "V6": "FIX_RATELIMIT", "RATELIMIT": "FIX_RATELIMIT",
    "V7": "FIX_MISCONFIG", "MISCONFIG": "FIX_MISCONFIG",
    "V8": "FIX_BOLA_ORDERS_DELETE",
}

_current: Dict[str, bool] = DEFAULT_FIXES.copy()


def reset_fixes() -> None:
    global _current
    _current = DEFAULT_FIXES.copy()


def set_fix(key: str, value: bool) -> bool:
    if key in _current:
        _current[key] = value
        return True
    return False


def get_fixes() -> Dict[str, bool]:
    return _current.copy()


def is_fixed(key: str) -> bool:
    return _current.get(key, False)
