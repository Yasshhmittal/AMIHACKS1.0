"""
Fix toggles for SentinelShop vulnerabilities.
When a fix is toggled to True, the endpoint enforces proper security checks.
"""

from typing import Dict

DEFAULT_FIXES: Dict[str, bool] = {
    "FIX_BOLA_ORDERS": False,       # V1: Check owner == current_user
    "FIX_BOLA_USERS": False,        # V2: Check requested id == current_user.id
    "FIX_BFLA_ADMIN": False,        # V3: Check current_user.role == 'admin'
    "FIX_EXPOSURE_ME": False,       # V4: Strip passwordHash, internalNotes, creditScore
    "FIX_AUTH_INVOICES": False,     # V5: Enforce authentication header on /invoices
    "FIX_RATELIMIT": False,         # V6: Rate limit /auth/login (max 5 attempts)
    "FIX_MISCONFIG": False,         # V7: Disable /debug/config, restrict CORS, set secure headers
    "FIX_BOLA_ORDERS_DELETE": False # V8: Check owner before delete
}

current_fixes: Dict[str, bool] = DEFAULT_FIXES.copy()

def reset_fixes():
    global current_fixes
    current_fixes = DEFAULT_FIXES.copy()

def set_fix(key: str, value: bool) -> bool:
    if key in current_fixes:
        current_fixes[key] = value
        return True
    return False

def get_fixes() -> Dict[str, bool]:
    return current_fixes.copy()

def is_fixed(key: str) -> bool:
    return current_fixes.get(key, False)
