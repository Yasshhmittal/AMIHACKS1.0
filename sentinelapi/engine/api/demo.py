"""Sandbox control: toggle a fix, reset. These proxy SentinelShop's control-plane
routes so the UI never has to know the target's internals."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from ..db import get_session
from ..models.schemas import FixToggleRequest, SimpleStatus
from ..models.tables import Scan, Target
from ..runtime import target_base_url

router = APIRouter(prefix="/api/demo", tags=["demo"])

# maps scanner vuln_id -> SentinelShop fix flag
from sentinelshop.fixes import VULN_TO_FIX  # type: ignore


def _latest_sandbox_base() -> str:
    with get_session() as s:
        t = s.exec(select(Target).order_by(Target.id.desc())).first()
        return t.base_url if t else "http://sentinelshop:4000"


@router.post("/fix/{vuln_id}", response_model=SimpleStatus)
async def apply_fix(vuln_id: str, body: FixToggleRequest = FixToggleRequest()):
    flag = VULN_TO_FIX.get(vuln_id.upper())
    if not flag:
        raise HTTPException(status_code=400, detail=f"Unknown vuln id: {vuln_id}")
    base = _latest_sandbox_base()
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(f"{base}/__fixes", json={"fixes": {flag: body.enabled}})
            r.raise_for_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Could not reach sandbox: {exc}")
    return SimpleStatus(status="ok", detail=f"{flag} set to {body.enabled}")


@router.post("/reset", response_model=SimpleStatus)
async def reset_sandbox():
    base = _latest_sandbox_base()
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(f"{base}/__reset")
            r.raise_for_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Could not reach sandbox: {exc}")
    return SimpleStatus(status="ok", detail="Sandbox reset to initial vulnerable state")
