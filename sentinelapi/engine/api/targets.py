"""Target, spec upload, identity config, and credential verification."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlmodel import delete, select

from ..core.executor import HttpExecutor
from ..core.guard import GuardViolation, SafetyGuard
from ..core.session import IdentitySession, vault
from ..db import get_session
from ..ingest.openapi_parser import parse_openapi_spec
from ..models.schemas import (EndpointResponse, IdentityIn, SpecUploadResponse,
                              TargetCreate, TargetResponse, VerifyResponse,
                              VerifyResultItem)
from ..models.tables import Endpoint, Identity, Spec, Target

router = APIRouter(prefix="/api/targets", tags=["targets"])


@router.post("", response_model=TargetResponse)
async def create_target(body: TargetCreate):
    # allowlist is enforced here too, before anything is stored
    try:
        SafetyGuard(body.base_url)
    except GuardViolation as gv:
        raise HTTPException(status_code=400, detail=str(gv))
    with get_session() as s:
        t = Target(base_url=body.base_url, environment=body.environment,
                   attested_by=body.attested_by, attested_at=datetime.now(timezone.utc))
        s.add(t)
        s.flush()
        return TargetResponse(id=t.id, base_url=t.base_url, environment=t.environment,
                              attested_by=t.attested_by,
                              attested_at=t.attested_at.isoformat() if t.attested_at else None)


@router.post("/{target_id}/spec", response_model=SpecUploadResponse)
async def upload_spec(target_id: int, file: UploadFile = File(...)):
    raw = (await file.read()).decode("utf-8", errors="replace")
    try:
        endpoints, parsed = parse_openapi_spec(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse OpenAPI spec: {exc}")
    if not endpoints:
        raise HTTPException(status_code=422, detail="No endpoints found in spec.")

    with get_session() as s:
        if not s.get(Target, target_id):
            raise HTTPException(status_code=404, detail="Target not found")
        spec = Spec(target_id=target_id, raw_hash=hashlib.sha256(raw.encode()).hexdigest(),
                    parsed_json={"info": parsed.get("info", {})}, endpoint_count=len(endpoints))
        s.add(spec)
        s.flush()
        out_eps: List[EndpointResponse] = []
        for ep in endpoints:
            row = Endpoint(
                spec_id=spec.id, method=ep.method, path=ep.path,
                operation_id=ep.operation_id, summary=ep.summary,
                spec_secured=ep.spec_secured, object_bearing=ep.object_bearing,
                admin_scoped=ep.admin_scoped,
                params_json={"path_params": ep.path_params, "owner_hint": ep.owner_hint},
                response_fields_json={"fields": sorted(ep.documented_response_fields)},
            )
            s.add(row)
            s.flush()
            out_eps.append(EndpointResponse(
                id=row.id, spec_id=spec.id, method=ep.method, path=ep.path,
                operation_id=ep.operation_id, summary=ep.summary,
                spec_secured=ep.spec_secured, object_bearing=ep.object_bearing,
                admin_scoped=ep.admin_scoped))
        return SpecUploadResponse(
            spec_id=spec.id, endpoint_count=len(out_eps),
            secured_count=sum(1 for e in out_eps if e.spec_secured),
            object_bearing_count=sum(1 for e in out_eps if e.object_bearing),
            admin_count=sum(1 for e in out_eps if e.admin_scoped),
            endpoints=out_eps)


@router.post("/{target_id}/identities")
async def set_identities(target_id: int, identities: List[IdentityIn]):
    with get_session() as s:
        if not s.get(Target, target_id):
            raise HTTPException(status_code=404, detail="Target not found")
        s.exec(delete(Identity).where(Identity.target_id == target_id))
        for i in identities:
            enc = vault.encrypt(i.credential) if i.credential else None
            s.add(Identity(target_id=target_id, label=i.label, role=i.role,
                           user_id=i.user_id, credential_encrypted=enc))
    return {"status": "ok", "count": len(identities)}


@router.post("/{target_id}/verify", response_model=VerifyResponse)
async def verify_identities(target_id: int):
    with get_session() as s:
        target = s.get(Target, target_id)
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        target_base_url = target.base_url
        ident_rows = s.exec(select(Identity).where(Identity.target_id == target_id)).all()
        # Extract fields to avoid detached instance errors outside session
        identities_data = [
            (r.label, r.role, r.user_id, r.credential_encrypted)
            for r in ident_rows
        ]
        
        spec = s.exec(select(Spec).where(Spec.target_id == target_id)
                      .order_by(Spec.id.desc())).first()
        endpoints = s.exec(select(Endpoint).where(Endpoint.spec_id == spec.id)).all() if spec else []

        # choose a protected, non-object GET endpoint to probe (e.g. /users/me)
        probe_ep = next((e for e in endpoints if e.method == "GET" and e.spec_secured
                         and not e.object_bearing), None)
        probe_path = probe_ep.path if probe_ep else "/health"

    guard = SafetyGuard(target_base_url)
    executor = HttpExecutor(guard)
    results: List[VerifyResultItem] = []
    try:
        for label, role, user_id, cred_enc in identities_data:
            cred = None
            if cred_enc:
                try:
                    cred = vault.decrypt(cred_enc)
                except Exception:
                    cred = None
            ident = IdentitySession(label, role, user_id, cred)
            res = await executor.execute("GET", f"{target_base_url}{probe_path}",
                                         headers=ident.get_auth_headers())
            if role == "anonymous":
                ok = res.status != 0  # reachable is enough for anon
            else:
                ok = res.ok
            results.append(VerifyResultItem(identity=label, ok=ok, status=res.status))
    finally:
        await executor.close()
    return VerifyResponse(results=results)
