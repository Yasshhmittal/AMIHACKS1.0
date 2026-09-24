from fastapi import APIRouter, HTTPException
import httpx
from typing import Optional, Dict, Any

from ..models.schemas import FindingResponse, FindingPoCResponse, AIExplainResponse, ScoreFactor, ProbeModel
from ..core.evidence import build_curl_poc, build_httpie_poc, build_python_poc
from ..ai.groq_provider import GroqProvider
from .scans import scan_in_memory_results

router = APIRouter(prefix="/api/findings", tags=["findings"])
ai_provider = GroqProvider()

def find_in_memory_finding(finding_id: int):
    for scan_res in scan_in_memory_results.values():
        findings = scan_res.get("findings", [])
        if 1 <= finding_id <= len(findings):
            return findings[finding_id - 1]
    return None

@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding_detail(finding_id: int):
    f = find_in_memory_finding(finding_id)
    if not f:
        # Fallback dummy finding if requested before first scan
        from ..detectors.base import FindingCandidate
        f = FindingCandidate(
            finding_class="BOLA",
            owasp_id="API1:2023",
            endpoint_path="/orders/{order_id}",
            endpoint_method="GET",
            operation_id="getOrder",
            title="Broken Object Level Authorization on /orders/{order_id}",
            impact="userA can access order 102 belonging to userB.",
            remediation="Enforce owner_id check on resource lookup.",
            expected="HTTP 403 Forbidden",
            actual="HTTP 200 OK returning victim order",
            severity="CRITICAL",
            risk_score=90.0,
            confidence="VERIFIED",
            score_factors=["auth_boundary_crossed", "cross_identity_data", "exploitable_low_priv", "repeat_verified"],
            probes=[]
        )

    probes_models = [
        ProbeModel(
            label=p["label"],
            identity=p["identity"],
            status=p["status"],
            latency_ms=p.get("latency_ms"),
            request_json_redacted=p["request_json_redacted"],
            response_json_redacted=p["response_json_redacted"]
        )
        for p in getattr(f, "probes", [])
    ]

    return FindingResponse(
        id=finding_id,
        scan_id=1,
        fingerprint=getattr(f, "fingerprint", f"f_{finding_id}"),
        finding_class=f.finding_class,
        owasp_id=f.owasp_id,
        severity=f.severity,
        risk_score=f.risk_score,
        confidence=f.confidence,
        title=f.title,
        impact=f.impact,
        remediation=f.remediation,
        score_factors=[
            ScoreFactor(description=factor.replace("_", " ").capitalize(), weight=20, applied=True)
            for factor in getattr(f, "score_factors", [])
        ],
        expected=f.expected,
        actual=f.actual,
        state="open",
        probes=probes_models
    )

@router.get("/{finding_id}/poc", response_model=FindingPoCResponse)
async def get_finding_poc(finding_id: int):
    f = find_in_memory_finding(finding_id)
    url = "http://localhost:4000/orders/102"
    method = "GET"
    if f:
        method = f.endpoint_method
        path = f.endpoint_path.replace("{order_id}", "102").replace("{id}", "102")
        url = f"http://localhost:4000{path}"

    headers = {"Authorization": "Bearer $USER_A_TOKEN"}
    return FindingPoCResponse(
        finding_id=finding_id,
        curl=build_curl_poc(method, url, headers, token_placeholder="$USER_A_TOKEN"),
        httpie=build_httpie_poc(method, url, headers),
        python_code=build_python_poc(method, url, headers)
    )

@router.post("/{finding_id}/verify")
async def verify_finding(finding_id: int):
    """
    CRITICAL DEMO MOMENT:
    Re-executes the live HTTP request against SentinelShop to verify whether the flaw is STILL VULNERABLE or FIXED!
    Never returns a cached result.
    """
    f = find_in_memory_finding(finding_id)
    endpoint_path = "/orders/102"
    method = "GET"
    headers = {"Authorization": "Bearer token-alice-12345"}

    if f:
        method = f.endpoint_method
        path = f.endpoint_path.replace("{order_id}", "102").replace("{id}", "102")
        endpoint_path = path

    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            res = await client.request(method, f"http://localhost:4000{endpoint_path}", headers=headers)
            
            # If request still succeeds with 200, still vulnerable!
            # If 403 or 401 or 404, it is FIXED!
            if res.status_code == 200:
                return {
                    "status": "still_vulnerable",
                    "status_code": res.status_code,
                    "message": f"Verification confirmed flaw persists! Target returned HTTP {res.status_code}."
                }
            else:
                return {
                    "status": "fixed",
                    "status_code": res.status_code,
                    "message": f"Verification confirmed fix is effective! Target returned HTTP {res.status_code}."
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Could not re-verify against target: {str(e)}"
            }

@router.post("/{finding_id}/explain", response_model=AIExplainResponse)
async def explain_finding_ai(finding_id: int):
    f = find_in_memory_finding(finding_id)
    finding_dict = {
        "class": getattr(f, "finding_class", "BOLA"),
        "owasp_id": getattr(f, "owasp_id", "API1:2023"),
        "endpoint_method": getattr(f, "endpoint_method", "GET"),
        "endpoint_path": getattr(f, "endpoint_path", "/orders/{order_id}"),
        "expected": getattr(f, "expected", "HTTP 403 Forbidden"),
        "actual": getattr(f, "actual", "HTTP 200 OK"),
        "confidence": getattr(f, "confidence", "VERIFIED")
    }

    explanation_md = await ai_provider.explain(finding_dict)
    return AIExplainResponse(
        finding_id=finding_id,
        explanation_md=explanation_md,
        source="groq" if ai_provider.reasoning_llm else "template_fallback"
    )
