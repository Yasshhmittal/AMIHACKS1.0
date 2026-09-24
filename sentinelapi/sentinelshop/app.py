"""SentinelShop — deliberately vulnerable sandbox target for SentinelAPI.

Ships 8 seeded flaws behind runtime fix toggles. The published contract
(openapi.yaml) documents the *intended secure* behaviour; the flaws live only
in this implementation. Control-plane routes (/__reset, /__fixes) are excluded
from the spec.

This app has no purpose outside the sandbox: it exists so the scanner has a
known-vulnerable target it can prove findings against and then watch get fixed.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from pydantic import BaseModel

from .data import (find_user_by_token, invoices_db, login_attempts, orders_db,
                   reset_database, users_db)
from .fixes import get_fixes, is_fixed, reset_fixes, set_fix

app = FastAPI(
    title="SentinelShop API",
    description="E-commerce demo target for SentinelAPI security verification.",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)


def get_current_user(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    if not authorization:
        return None
    return find_user_by_token(authorization.replace("Bearer ", "").strip())


def require_auth(authorization: Optional[str]) -> Dict[str, Any]:
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication credentials missing or invalid")
    return user


@app.middleware("http")
async def security_headers_and_cors(request: Request, call_next):
    origin = request.headers.get("origin")
    response: Response = await call_next(request)
    if is_fixed("FIX_MISCONFIG"):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if origin and ("sentinelshop" in origin or "localhost" in origin or "127.0.0.1" in origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
    else:
        # Vulnerable: reflect any Origin with credentials, leak server version,
        # omit hardening headers.
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Server"] = "SentinelShop/1.0.4 (Ubuntu 22.04 LTS; Python 3.11.8)"
        response.headers["X-Powered-By"] = "FastAPI/0.115.0"
    return response


# ----------------------------------------------------------- control plane (not in spec)

@app.post("/__reset")
async def control_reset():
    reset_database()
    reset_fixes()
    return {"status": "reset_successful"}


@app.get("/__fixes")
async def control_get_fixes():
    return get_fixes()


class FixUpdate(BaseModel):
    fixes: Dict[str, bool]


@app.post("/__fixes")
async def control_set_fixes(payload: FixUpdate):
    for k, v in payload.fixes.items():
        set_fix(k, v)
    return {"status": "updated", "current_fixes": get_fixes()}


# ----------------------------------------------------------- auth

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    login_attempts.append(req.username)
    # V6: rate limiting only present when fixed
    if is_fixed("FIX_RATELIMIT") and len(login_attempts) > 5:
        response.status_code = 429
        response.headers["Retry-After"] = "60"
        response.headers["RateLimit-Limit"] = "5"
        response.headers["RateLimit-Remaining"] = "0"
        return {"error": "Too many login attempts. Please wait 60 seconds."}
    for user in users_db.values():
        if user["username"] == req.username and req.password in ("password", user["username"]):
            return {"token": user["token"], "token_type": "Bearer",
                    "userId": str(user["id"]), "role": user["role"]}
    raise HTTPException(status_code=401, detail="Invalid username or password")


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


@app.post("/auth/register", status_code=201)
async def register(req: RegisterRequest):
    new_id = max(users_db.keys(), default=0) + 1
    users_db[new_id] = {
        "id": new_id, "username": req.username, "email": req.email, "role": "user",
        "passwordHash": f"$2b$12${req.username}hashsalt", "internalNotes": "Self-service signup",
        "creditScore": 650, "token": f"token-{req.username}-{new_id}000",
    }
    return {"id": new_id, "username": req.username, "email": req.email}


@app.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    return {"status": "logged_out"}


# ----------------------------------------------------------- users

@app.get("/users/me")
async def get_my_profile(authorization: Optional[str] = Header(None)):
    user = require_auth(authorization)
    base = {"id": user["id"], "username": user["username"], "email": user["email"], "role": user["role"]}
    if is_fixed("FIX_EXPOSURE_ME"):
        return base
    # V4: excessive data exposure
    base.update({"passwordHash": user["passwordHash"], "internalNotes": user["internalNotes"],
                 "creditScore": user["creditScore"]})
    return base


@app.get("/users/{user_id}")
async def get_user_profile(user_id: int, authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    # V2: BOLA on profile
    if is_fixed("FIX_BOLA_USERS") and current["id"] != user_id and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: cannot access another user's profile")
    t = users_db[user_id]
    return {"id": t["id"], "username": t["username"], "email": t["email"], "role": t["role"]}


# ----------------------------------------------------------- orders (hero)

@app.get("/orders")
async def list_orders(authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    return [o for o in orders_db.values() if o["userId"] == current["id"]]


class CreateOrder(BaseModel):
    item: str
    amount: float


@app.post("/orders", status_code=201)
async def create_order(req: CreateOrder, authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    new_id = max(orders_db.keys(), default=100) + 1
    order = {"id": new_id, "userId": current["id"], "item": req.item, "amount": req.amount, "status": "pending"}
    orders_db[new_id] = order
    return order


@app.get("/orders/{order_id}")
async def get_order(order_id: int, authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    order = orders_db[order_id]
    # V1: BOLA read (the hero flaw)
    if is_fixed("FIX_BOLA_ORDERS") and order["userId"] != current["id"] and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: you do not own this order")
    return order


@app.delete("/orders/{order_id}")
async def delete_order(order_id: int, authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    order = orders_db[order_id]
    # V8: BOLA write
    if is_fixed("FIX_BOLA_ORDERS_DELETE") and order["userId"] != current["id"] and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: you do not own this order")
    del orders_db[order_id]
    return {"status": "deleted", "order_id": order_id}


# ----------------------------------------------------------- admin

@app.get("/admin/users")
async def admin_list_users(authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    # V3: BFLA — role not checked unless fixed
    if is_fixed("FIX_BFLA_ADMIN") and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: administrator privilege required")
    return [{"id": u["id"], "username": u["username"], "email": u["email"], "role": u["role"]}
            for u in users_db.values()]


@app.get("/admin/dashboard")
async def admin_dashboard(authorization: Optional[str] = Header(None)):
    current = require_auth(authorization)
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: administrator privilege required")
    return {"total_revenue": 944.49, "active_users": len(users_db),
            "total_orders": len(orders_db), "system_status": "healthy"}


# ----------------------------------------------------------- invoices

@app.get("/invoices")
async def list_invoices(authorization: Optional[str] = Header(None)):
    # V5: spec says secured, but auth only enforced when fixed
    if is_fixed("FIX_AUTH_INVOICES"):
        require_auth(authorization)
    return list(invoices_db.values())


# ----------------------------------------------------------- misconfig / debug

@app.get("/debug/config")
async def debug_config():
    # V7: debug endpoint exposed unless fixed
    if is_fixed("FIX_MISCONFIG"):
        raise HTTPException(status_code=404, detail="Not Found")
    return {"environment": "staging", "debug_mode": True,
            "database_host": "db.internal.sentinelshop.local",
            "internal_api_key": "sec_internal_live_key_99182371",
            "aws_region": "us-east-1", "allowed_hosts": ["*"]}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "sentinelshop"}
