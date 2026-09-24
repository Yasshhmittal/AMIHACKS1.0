import logging
from typing import Dict, Any, List
from .provider import AIProvider
from .null_provider import NullProvider
from ..config import settings

logger = logging.getLogger("sentinel.ai.groq")

class GroqProvider(AIProvider):
    def __init__(self):
        self.fallback = NullProvider()
        self.reasoning_llm = None
        self.fast_llm = None

        if settings.GROQ_API_KEY:
            try:
                from langchain_groq import ChatGroq
                self.reasoning_llm = ChatGroq(
                    api_key=settings.GROQ_API_KEY,
                    model=settings.GROQ_REASONING_MODEL,
                    temperature=0.1
                )
                self.fast_llm = ChatGroq(
                    api_key=settings.GROQ_API_KEY,
                    model=settings.GROQ_FAST_MODEL,
                    temperature=0.1
                )
            except Exception as e:
                logger.warning(f"Could not initialize Groq Chat client: {e}. Falling back to NullProvider.")

    async def explain(self, finding_data: Dict[str, Any]) -> str:
        """
        Uses Llama 3.3 70B via Groq to generate forensic impact analysis and framework-specific remediation.
        Crucial: Prompt only contains sanitized metadata, NO raw customer tokens or customer data!
        """
        if not self.reasoning_llm:
            return await self.fallback.explain(finding_data)

        prompt = f"""You are a principal cybersecurity engineer reviewing an automated Zero-Trust API audit finding.
Analyze this confirmed security vulnerability and provide:
1. Executive Impact Summary (1-2 sentences on business risk).
2. Root Cause Analysis (why this happens in API implementations).
3. Concrete Code Remediation (provide code snippets for FastAPI / Python and Express.js).

Vulnerability Context:
- Finding Class: {finding_data.get('class')} (OWASP {finding_data.get('owasp_id')})
- Endpoint: {finding_data.get('endpoint_method')} {finding_data.get('endpoint_path')}
- Expected Behavior: {finding_data.get('expected')}
- Actual Behavior: {finding_data.get('actual')}
- Confidence: {finding_data.get('confidence')}

Format your response in clean Markdown with headers and syntax-highlighted code blocks."""

        try:
            res = await self.reasoning_llm.ainvoke(prompt)
            return res.content
        except Exception as e:
            logger.error(f"Groq reasoning error: {e}. Using fallback template.")
            return await self.fallback.explain(finding_data)

    async def summarize(self, scan_summary_data: Dict[str, Any]) -> str:
        if not self.fast_llm:
            return await self.fallback.summarize(scan_summary_data)

        prompt = f"""You are an API security auditor. Generate a professional, concise executive summary (1 paragraph) 
for an executive security report summarizing these automated scan metrics:
- Total Endpoints Audited: {scan_summary_data.get('total_endpoints', 0)}
- Total Requests Sent: {scan_summary_data.get('total_requests', 0)}
- Findings Breakdown: {scan_summary_data.get('findings_by_severity', {})}
- Overall Risk Score: {scan_summary_data.get('risk_score', 0)} / 100

State clearly the posture of the target API and the priority actions needed."""

        try:
            res = await self.fast_llm.ainvoke(prompt)
            return res.content
        except Exception as e:
            logger.error(f"Groq summary error: {e}. Using fallback.")
            return await self.fallback.summarize(scan_summary_data)

    async def generate_hypotheses(self, spec_endpoints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Sanitized endpoint metadata -> hypotheses
        return []
