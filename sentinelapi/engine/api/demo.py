from fastapi import APIRouter, HTTPException
import httpx
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter(prefix="/api/demo", tags=["demo"])

class FixToggleRequest(BaseModel):
    enabled: bool

VULN_KEY_MAP = {
    "bola_orders": "FIX_BOLA_ORDERS",
    "bola_users": "FIX_BOLA_USERS",
    "bfla_admin": "FIX_BFLA_ADMIN",
    "exposure_me": "FIX_EXPOSURE_ME",
    "auth_invoices": "FIX_AUTH_INVOICES",
    "ratelimit": "FIX_RATELIMIT",
    "misconfig": "FIX_MISCONFIG",
    "1": "FIX_BOLA_ORDERS",
    "2": "FIX_EXPOSURE_ME",
    "3": "FIX_BFLA_ADMIN",
    "4": "FIX_AUTH_INVOICES"
}

@router.post("/fix/{vuln_id}")
async def toggle_fix(vuln_id: str, payload: FixToggleRequest):
    fix_key = VULN_KEY_MAP.get(vuln_id.lower(), vuln_id.upper())
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            res = await client.post("http://localhost:4000/__fixes", json={"fixes": {fix_key: payload.enabled}})
            return res.json()
        except Exception as e:
            # Fallback to local import if running together
            from sentinelshop.fixes import set_fix, get_fixes
            set_fix(fix_key, payload.enabled)
            return {"status": "updated_local", "current_fixes": get_fixes()}

@router.get("/fixes")
async def get_sandbox_fixes():
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            res = await client.get("http://localhost:4000/__fixes")
            return res.json()
        except Exception:
            from sentinelshop.fixes import get_fixes
            return get_fixes()

@router.post("/reset")
async def reset_sandbox():
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            res = await client.post("http://localhost:4000/__reset")
            return res.json()
        except Exception:
            from sentinelshop.data import reset_database
            from sentinelshop.fixes import reset_fixes
            reset_database()
            reset_fixes()
            return {"status": "reset_successful_local"}
