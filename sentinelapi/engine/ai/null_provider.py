from typing import Dict, Any, List
from .provider import AIProvider

class NullProvider(AIProvider):
    """
    Deterministic template-driven fallback provider.
    Ensures SentinelAPI operates seamlessly when offline, without API keys, or when AI is disabled.
    """
    async def explain(self, finding_data: Dict[str, Any]) -> str:
        f_class = finding_data.get("class", "VULNERABILITY")
        endpoint = finding_data.get("endpoint_path", "")
        
        if f_class == "BOLA":
            return (
                f"### Analysis: Broken Object Level Authorization on `{endpoint}`\n\n"
                "**Root Cause:** The endpoint accepts an object identifier directly from client input and "
                "returns internal data without validating that the authenticated user owns that specific resource.\n\n"
                "**Remediation (FastAPI / Python):**\n"
                "```python\n"
                f"@app.get('{endpoint}')\n"
                "def get_resource(id: int, current_user = Depends(get_current_user)):\n"
                "    resource = db.find(id)\n"
                "    if not resource:\n"
                "        raise HTTPException(status_code=404, detail='Not found')\n"
                "    if resource.owner_id != current_user.id and current_user.role != 'admin':\n"
                "        raise HTTPException(status_code=403, detail='Forbidden')\n"
                "    return resource\n"
                "```"
            )
        elif f_class == "BFLA":
            return (
                f"### Analysis: Broken Function Level Authorization on `{endpoint}`\n\n"
                "**Root Cause:** Administrative functionality was accessible to low-privilege authenticated accounts.\n\n"
                "**Remediation:** Enforce role-based access control (RBAC) checks at the route entry point."
            )
        elif f_class == "EXCESSIVE_DATA_EXPOSURE":
            return (
                f"### Analysis: Excessive Data Exposure on `{endpoint}`\n\n"
                "**Root Cause:** Database records or sensitive attributes were serialized without projection.\n\n"
                "**Remediation:** Define a restrictive Pydantic `response_model` or DTO."
            )
        else:
            return (
                f"### Analysis: {f_class} on `{endpoint}`\n\n"
                "**Root Cause:** Violation of zero-trust authorization boundary.\n"
                "**Remediation:** Review endpoint implementation against security specifications."
            )

    async def summarize(self, scan_summary_data: Dict[str, Any]) -> str:
        total = scan_summary_data.get("total_findings", 0)
        critical = scan_summary_data.get("critical_count", 0)
        high = scan_summary_data.get("high_count", 0)
        return (
            f"SentinelAPI completed an automated Zero-Trust authorization sweep and discovered {total} security findings "
            f"({critical} Critical, {high} High). The most severe issues involve object-level authorization bypasses (BOLA) "
            "and sensitive data exposure. Prioritize remediation of Critical severity items before production deployment."
        )

    async def generate_hypotheses(self, spec_endpoints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return []
