"""Groq provider via LangChain. Falls back to NullProvider text on any error, so
the AI layer can never break a scan or a page.

Hard boundaries (enforced by construction):
  * the model receives only sanitized finding/spec metadata — never tokens,
    passwords, cookies, response bodies, or customer data
  * the model cannot create a finding, change severity/confidence, or add a target
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from ..config import settings
from .null_provider import NullProvider
from .provider import AIProvider

logger = logging.getLogger("sentinel.ai")


class GroqProvider(AIProvider):
    name = "groq"

    def __init__(self):
        self._fallback = NullProvider()
        self._reasoning = None
        self._fast = None
        if settings.GROQ_API_KEY:
            try:
                from langchain_groq import ChatGroq
                self._reasoning = ChatGroq(model=settings.GROQ_REASONING_MODEL,
                                           temperature=0, api_key=settings.GROQ_API_KEY)
                self._fast = ChatGroq(model=settings.GROQ_FAST_MODEL,
                                      temperature=0, api_key=settings.GROQ_API_KEY)
                logger.info("Groq provider ready (%s / %s).",
                            settings.GROQ_REASONING_MODEL, settings.GROQ_FAST_MODEL)
            except Exception as exc:  # pragma: no cover
                logger.warning("Groq init failed (%s); using template fallback.", exc)

    @property
    def available(self) -> bool:
        return self._reasoning is not None

    async def explain(self, finding: Dict[str, Any]) -> str:
        if not self.available:
            return await self._fallback.explain(finding)
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import StrOutputParser
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are an application-security expert. Given verified vulnerability "
                           "evidence, explain the business impact in plain English and give concise, "
                           "correct remediation with framework-specific code for FastAPI, Django and "
                           "Express. Be precise; do not invent details beyond the evidence. Output markdown."),
                ("human", "Finding class: {finding_class}\nOWASP: {owasp_id}\nEndpoint: {endpoint}\n"
                          "Severity: {severity}\nExpected: {expected}\nActual: {actual}\n"
                          "Impact: {impact}\n\nExplain the impact and provide the three fixes."),
            ])
            chain = prompt | self._reasoning | StrOutputParser()
            return await chain.ainvoke({
                "finding_class": finding.get("finding_class") or finding.get("class", ""),
                "owasp_id": finding.get("owasp_id", ""),
                "endpoint": finding.get("endpoint", ""),
                "severity": finding.get("severity", ""),
                "expected": finding.get("expected", ""),
                "actual": finding.get("actual", ""),
                "impact": finding.get("impact", ""),
            })
        except Exception as exc:  # pragma: no cover
            logger.warning("Groq explain failed (%s); falling back.", exc)
            return await self._fallback.explain(finding)

    async def summarize(self, scan: Dict[str, Any]) -> str:
        if not self.available:
            return await self._fallback.summarize(scan)
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.output_parsers import StrOutputParser
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a security lead writing a 4-6 sentence executive summary of an API "
                           "scan for a mixed technical/non-technical audience. Rank by risk. No fluff."),
                ("human", "Endpoints: {total_endpoints}\nRequests: {total_requests}\n"
                          "Findings by severity: {findings_by_severity}\n"
                          "Findings by class: {findings_by_class}\nRisk score: {risk_score}"),
            ])
            chain = prompt | self._reasoning | StrOutputParser()
            return await chain.ainvoke({
                "total_endpoints": scan.get("total_endpoints", 0),
                "total_requests": scan.get("total_requests", 0),
                "findings_by_severity": scan.get("findings_by_severity", {}),
                "findings_by_class": scan.get("findings_by_class", {}),
                "risk_score": scan.get("risk_score", 0),
            })
        except Exception as exc:  # pragma: no cover
            logger.warning("Groq summarize failed (%s); falling back.", exc)
            return await self._fallback.summarize(scan)

    async def generate_hypotheses(self, spec_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        # Bounded, validated hypotheses are a stretch feature; the deterministic
        # engine already covers the seeded classes, so default to none.
        return []
