"""NullProvider — deterministic template fallback. Every scan produces identical
findings with this provider; only the prose differs from the Groq path.
"""
from __future__ import annotations

from typing import Any, Dict, List

from .provider import AIProvider

FIX_SNIPPETS = {
    "BOLA": {
        "FastAPI": ("@app.get('/orders/{order_id}')\n"
                    "def get_order(order_id: int, user=Depends(current_user)):\n"
                    "    order = db.get(order_id)\n"
                    "    if order.owner_id != user.id and user.role != 'admin':\n"
                    "        raise HTTPException(403)\n"
                    "    return order"),
        "Django": ("order = get_object_or_404(Order, pk=order_id)\n"
                   "if order.owner_id != request.user.id and not request.user.is_staff:\n"
                   "    return HttpResponseForbidden()"),
        "Express": ("const order = await Order.findById(req.params.id);\n"
                    "if (order.ownerId !== req.user.id && req.user.role !== 'admin')\n"
                    "  return res.status(403).send();"),
    },
}


class NullProvider(AIProvider):
    name = "template"

    async def explain(self, finding: Dict[str, Any]) -> str:
        cls = finding.get("finding_class") or finding.get("class", "")
        title = finding.get("title", "")
        impact = finding.get("impact", "")
        remediation = finding.get("remediation", "")
        expected = finding.get("expected", "")
        actual = finding.get("actual", "")
        snippets = FIX_SNIPPETS.get(cls, {})
        parts = [
            f"## {title}", "",
            f"**What happened.** {impact}", "",
            f"**Expected:** {expected}", f"**Actual:** {actual}", "",
            f"**How to fix.** {remediation}", "",
        ]
        if snippets:
            parts.append("**Framework-specific fixes:**")
            for fw, code in snippets.items():
                parts += [f"\n*{fw}*", "```", code, "```"]
        parts.append("\n_Generated from the deterministic finding (no LLM). Add a GROQ_API_KEY to enable AI explanations._")
        return "\n".join(parts)

    async def summarize(self, scan: Dict[str, Any]) -> str:
        by_sev = scan.get("findings_by_severity", {})
        n = scan.get("total_findings", 0)
        ordered = [f"{by_sev.get(s, 0)} {s.lower()}" for s in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO") if by_sev.get(s)]
        return (f"SentinelAPI scanned {scan.get('total_endpoints', 0)} endpoints across "
                f"{scan.get('total_requests', 0)} requests and confirmed {n} finding(s): "
                f"{', '.join(ordered) or 'none'}. "
                "Each finding is backed by real HTTP evidence and a reproducible proof-of-concept. "
                "Prioritise the authorization findings (BOLA/BFLA) first — they expose one customer's "
                "data to another and are the highest-impact class here.")

    async def generate_hypotheses(self, spec_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        return []
