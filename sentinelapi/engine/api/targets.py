from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import List, Optional
import httpx
import json
from ..models.schemas import (
    TargetCreate, TargetResponse, SpecUploadResponse,
    IdentityCreate, IdentityResponse, VerifyIdentitiesResponse, IdentityVerificationResult,
    EndpointSchema
)
from ..core.guard import SafetyGuard
from ..core.session import vault, IdentitySession
from ..ingest.openapi_parser import parse_openapi_spec
from ..db import get_db

router = APIRouter(prefix="/api/targets", tags=["targets"])

# In-memory store fallback when DB client is initializing or running in memory
in_memory_targets = {}
in_memory_specs = {}
in_memory_identities = {}

@router.post("", response_model=TargetResponse)
async def create_target(payload: TargetCreate):
    # Enforce allowlist check
    if not SafetyGuard.is_allowlisted_host(payload.base_url.split("://")[-1].split("/")[0].split(":")[0]):
        raise HTTPException(
            status_code=400,
            detail="Target host is outside the authorized allowlist. Scanning unauthorized hosts is prohibited."
        )

    db = get_db()
    if db and db.is_connected():
        target = await db.target.create(
            data={
                "baseUrl": payload.base_url,
                "environment": payload.environment,
                "attestedBy": payload.attested_by
            }
        )
        return TargetResponse(
            id=target.id,
            base_url=target.baseUrl,
            environment=target.environment,
            attested_by=target.attestedBy,
            attested_at=target.attestedAt
        )
    else:
        new_id = len(in_memory_targets) + 1
        t_data = {
            "id": new_id,
            "base_url": payload.base_url,
            "environment": payload.environment,
            "attested_by": payload.attested_by,
            "attested_at": None
        }
        in_memory_targets[new_id] = t_data
        return TargetResponse(**t_data)

@router.post("/{target_id}/spec", response_model=SpecUploadResponse)
async def upload_spec(target_id: int, file: UploadFile = File(...)):
    content = await file.read()
    raw_str = content.decode("utf-8")

    spec_dict, endpoints = parse_openapi_spec(raw_str)
    if not endpoints:
        raise HTTPException(status_code=400, detail="No valid endpoints found in uploaded specification.")

    secured_count = sum(1 for ep in endpoints if ep.spec_secured)
    object_bearing_count = sum(1 for ep in endpoints if ep.object_bearing)
    admin_scoped_count = sum(1 for ep in endpoints if ep.admin_scoped)

    ep_schemas = [
        EndpointSchema(
            id=idx + 1,
            method=ep.method,
            path=ep.path,
            operation_id=ep.operation_id,
            summary=ep.summary,
            spec_secured=ep.spec_secured,
            object_bearing=ep.object_bearing,
            admin_scoped=ep.admin_scoped,
            params_json={"path_params": ep.path_params, "query_params": ep.query_params},
            response_fields_json=ep.response_schema_fields
        )
        for idx, ep in enumerate(endpoints)
    ]

    db = get_db()
    if db and db.is_connected():
        spec = await db.spec.create(
            data={
                "targetId": target_id,
                "rawHash": str(hash(raw_str)),
                "parsedJson": json.dumps(spec_dict),
                "endpointCount": len(endpoints),
                "endpoints": {
                    "create": [
                        {
                            "method": ep.method,
                            "path": ep.path,
                            "operationId": ep.operation_id,
                            "summary": ep.summary,
                            "specSecured": ep.spec_secured,
                            "objectBearing": ep.object_bearing,
                            "adminScoped": ep.admin_scoped,
                            "paramsJson": json.dumps({"path_params": ep.path_params, "query_params": ep.query_params}),
                            "responseFields": json.dumps(ep.response_schema_fields)
                        }
                        for ep in endpoints
                    ]
                }
            },
            include={"endpoints": True}
        )
        spec_id = spec.id
    else:
        spec_id = len(in_memory_specs) + 1
        in_memory_specs[spec_id] = {
            "spec_id": spec_id,
            "target_id": target_id,
            "spec_dict": spec_dict,
            "endpoints": endpoints
        }

    return SpecUploadResponse(
        spec_id=spec_id,
        target_id=target_id,
        endpoint_count=len(endpoints),
        secured_count=secured_count,
        object_bearing_count=object_bearing_count,
        admin_scoped_count=admin_scoped_count,
        endpoints=ep_schemas
    )

@router.post("/{target_id}/identities", response_model=List[IdentityResponse])
async def configure_identities(target_id: int, identities: List[IdentityCreate]):
    created_list = []
    db = get_db()

    for ident in identities:
        enc_cred = vault.encrypt_credential(ident.credential) if ident.credential else None
        if db and db.is_connected():
            rec = await db.identity.create(
                data={
                    "targetId": target_id,
                    "label": ident.label,
                    "role": ident.role,
                    "userId": ident.user_id,
                    "credentialEncrypted": enc_cred
                }
            )
            created_list.append(IdentityResponse(
                id=rec.id,
                target_id=rec.targetId,
                label=rec.label,
                role=rec.role,
                user_id=rec.userId
            ))
        else:
            nid = len(in_memory_identities) + 1
            rec_data = {
                "id": nid,
                "target_id": target_id,
                "label": ident.label,
                "role": ident.role,
                "user_id": ident.user_id,
                "credential": ident.credential
            }
            in_memory_identities[nid] = rec_data
            created_list.append(IdentityResponse(**rec_data))

    return created_list

@router.post("/{target_id}/verify", response_model=VerifyIdentitiesResponse)
async def verify_identities(target_id: int):
    # Lookup target base url
    db = get_db()
    base_url = "http://localhost:4000"
    if db and db.is_connected():
        t = await db.target.find_unique(where={"id": target_id})
        if t:
            base_url = t.baseUrl
    elif target_id in in_memory_targets:
        base_url = in_memory_targets[target_id]["base_url"]

    # Test each identity by requesting /users/me or /health
    results = []
    all_ok = True

    async with httpx.AsyncClient(timeout=5.0) as client:
        # Predefined sandbox tokens if in memory
        test_accounts = [
            ("anonymous", {}),
            ("userA", {"Authorization": "Bearer token-alice-12345"}),
            ("userB", {"Authorization": "Bearer token-bob-67890"}),
            ("admin", {"Authorization": "Bearer token-admin-99999"})
        ]

        for label, headers in test_accounts:
            try:
                check_path = "/health" if label == "anonymous" else "/users/me"
                res = await client.get(f"{base_url}{check_path}", headers=headers)
                ok = (res.status_code == 200)
                if not ok:
                    all_ok = False
                results.append(IdentityVerificationResult(
                    identity=label,
                    ok=ok,
                    status_code=res.status_code,
                    message="Credentials verified successfully" if ok else f"Unexpected response HTTP {res.status_code}"
                ))
            except Exception as e:
                all_ok = False
                results.append(IdentityVerificationResult(
                    identity=label,
                    ok=False,
                    status_code=None,
                    message=f"Connection error: {str(e)}"
                ))

    return VerifyIdentitiesResponse(
        target_id=target_id,
        all_ok=all_ok,
        results=results
    )
