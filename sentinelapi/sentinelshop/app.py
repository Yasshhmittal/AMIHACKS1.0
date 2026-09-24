"""
SentinelShop — Vulnerable Sandbox Target for AmiHacks Track C.
Implements 8 seeded vulnerabilities with runtime fix toggles and in-memory reset.
"""

from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from .data import users_db, orders_db, invoices_db, login_attempts, reset_database
from .fixes import is_fixed, set_fix, get_fixes, reset_fixes

app = FastAPI(
    title="SentinelShop API",
    description="E-commerce demo target for SentinelAPI security verification.",
    version="1.0.0",
    docs_url=None, # Disabled default docs to avoid spec confusion; custom openapi.yaml provided
    redoc_url=None
)

# Helper: Extract current user from Authorization header
def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    for user in users_db.values():
        if user.get("token") == token:
            return user
    return None

def require_auth(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials missing or invalid"
        )
    return user

# Middleware for headers and CORS
@app.middleware("http")
async def security_headers_and_cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    response: Response = await call_next(request)

    # Misconfiguration V7: Unless FIX_MISCONFIG is True, reflect any Origin with credentials
    # and expose version header while omitting security headers
    if is_fixed("FIX_MISCONFIG"):
        # Fixed state: strict CORS & security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if origin and ("sentinelshop.local" in origin or "localhost" in origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
    else:
        # Vulnerable state: reflect arbitrary origin with credentials, leak server version
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Server"] = "SentinelShop/1.0.4 (Ubuntu 22.04 LTS; Python 3.11.8)"
        response.headers["X-Powered-By"] = "FastAPI/0.115.0"
        # Intentionally missing: X-Content-Type-Options, X-Frame-Options, HSTS

    return response


# =====================================================================
# CONTROL PLANE ROUTES (EXCLUDED FROM OPENAPI SPEC)
# =====================================================================

@app.post("/__reset")
async def control_reset():
    reset_database()
    reset_fixes()
    return {"status": "reset_successful", "message": "Database and fix toggles reverted to initial vulnerable state"}

@app.get("/__fixes")
async def control_get_fixes():
    return get_fixes()

class FixUpdateRequest(BaseModel):
    fixes: Dict[str, bool]

@app.post("/__fixes")
async def control_set_fixes(payload: FixUpdateRequest):
    updated = {}
    for k, v in payload.fixes.items():
        if set_fix(k, v):
            updated[k] = v
    return {"status": "updated", "current_fixes": get_fixes()}


# =====================================================================
# AUTH ROUTES
# =====================================================================

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    # V6: Missing Rate Limiting
    login_attempts.append(req.username)
    if is_fixed("FIX_RATELIMIT"):
        if len(login_attempts) > 5:
            response.status_code = status.HTTP_429_TOO_MANY_REQUESTS
            response.headers["Retry-After"] = "60"
            response.headers["RateLimit-Limit"] = "5"
            response.headers["RateLimit-Remaining"] = "0"
            return {"error": "Too many failed login attempts. Please wait 60 seconds."}

    for user in users_db.values():
        if user["username"] == req.username and (req.password == "password" or req.password == user["username"]):
            return {
                "token": user["token"],
                "token_type": "Bearer",
                "userId": str(user["id"]),
                "role": user["role"]
            }
    
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest):
    new_id = max(users_db.keys(), default=0) + 1
    new_user = {
        "id": new_id,
        "username": req.username,
        "email": req.email,
        "role": "user",
        "passwordHash": f"$2b$12${req.username}hashsalt",
        "internalNotes": "Newly registered self-service user",
        "creditScore": 650,
        "token": f"token-{req.username}-{new_id}000"
    }
    users_db[new_id] = new_user
    return {"id": new_id, "username": req.username, "email": req.email}

@app.post("/auth/logout")
async def logout(current_user: Dict[str, Any] = Header(None)):
    return {"status": "logged_out"}


# =====================================================================
# USER ROUTES
# =====================================================================

@app.get("/users/me")
async def get_my_profile(authorization: Optional[str] = Header(None)):
    user = require_auth(authorization)
    
    # V4: Excessive Data Exposure
    if is_fixed("FIX_EXPOSURE_ME"):
        # Clean response adhering to contract
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"]
        }
    else:
        # Flaw: Leaking passwordHash, internalNotes, creditScore
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "passwordHash": user["passwordHash"],
            "internalNotes": user["internalNotes"],
            "creditScore": user["creditScore"]
        }

@app.get("/users/{user_id}")
async def get_user_profile(user_id: int, authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
        
    target_user = users_db[user_id]
    
    # V2: BOLA on user profile
    if is_fixed("FIX_BOLA_USERS"):
        if current_user["id"] != user_id and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access another user's profile")
            
    return {
        "id": target_user["id"],
        "username": target_user["username"],
        "email": target_user["email"],
        "role": target_user["role"]
    }


# =====================================================================
# ORDER ROUTES (THE HERO DETECTOR)
# =====================================================================

@app.get("/orders")
async def list_orders(authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    # Collection endpoint: return current user's orders (used for seed ID discovery)
    user_orders = [o for o in orders_db.values() if o["userId"] == current_user["id"]]
    return user_orders

class CreateOrderRequest(BaseModel):
    item: str
    amount: float

@app.post("/orders", status_code=status.HTTP_201_CREATED)
async def create_order(req: CreateOrderRequest, authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    new_id = max(orders_db.keys(), default=100) + 1
    new_order = {
        "id": new_id,
        "userId": current_user["id"],
        "item": req.item,
        "amount": req.amount,
        "status": "pending"
    }
    orders_db[new_id] = new_order
    return new_order

@app.get("/orders/{order_id}")
async def get_order(order_id: int, authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
        
    order = orders_db[order_id]
    
    # V1: BOLA Read Flaw
    if is_fixed("FIX_BOLA_ORDERS"):
        if order["userId"] != current_user["id"] and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You do not own this order")
            
    return order

@app.delete("/orders/{order_id}")
async def delete_order(order_id: int, authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
        
    order = orders_db[order_id]
    
    # V8: BOLA Write Flaw
    if is_fixed("FIX_BOLA_ORDERS_DELETE"):
        if order["userId"] != current_user["id"] and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You do not own this order")
            
    del orders_db[order_id]
    return {"status": "deleted", "order_id": order_id}


# =====================================================================
# ADMIN ROUTES
# =====================================================================

@app.get("/admin/users")
async def admin_list_users(authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    
    # V3: BFLA Flaw (Role not checked when not fixed)
    if is_fixed("FIX_BFLA_ADMIN"):
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: Administrator privilege required")
            
    return [
        {"id": u["id"], "username": u["username"], "email": u["email"], "role": u["role"]}
        for u in users_db.values()
    ]

@app.get("/admin/dashboard")
async def admin_dashboard(authorization: Optional[str] = Header(None)):
    current_user = require_auth(authorization)
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Administrator privilege required")
        
    return {
        "total_revenue": 944.49,
        "active_users": len(users_db),
        "total_orders": len(orders_db),
        "system_status": "healthy"
    }


# =====================================================================
# INVOICE ROUTES (BROKEN AUTH)
# =====================================================================

@app.get("/invoices")
async def list_invoices(authorization: Optional[str] = Header(None)):
    # V5: Broken Authentication (Spec says secured, but anon is allowed)
    if is_fixed("FIX_AUTH_INVOICES"):
        require_auth(authorization)
    return list(invoices_db.values())


# =====================================================================
# MISCONFIGURATION & DEBUG ROUTES
# =====================================================================

@app.get("/debug/config")
async def debug_config():
    # V7: Misconfiguration / Debug Endpoint Exposed
    if is_fixed("FIX_MISCONFIG"):
        raise HTTPException(status_code=404, detail="Not Found")
        
    return {
        "environment": "staging",
        "debug_mode": True,
        "database_host": "db.internal.sentinelshop.local",
        "internal_api_key": "sec_internal_live_key_99182371",
        "aws_region": "us-east-1",
        "allowed_hosts": ["*"]
    }

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "sentinelshop"}
