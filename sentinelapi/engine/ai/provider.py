"""Abstract AI provider. The scanner NEVER depends on this to produce a finding —
AI only explains, summarizes, or proposes (validated) extra tests.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class AIProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def explain(self, finding: Dict[str, Any]) -> str:
        """Evidence bundle -> plain-English impact + framework-specific fix (markdown)."""

    @abstractmethod
    async def summarize(self, scan: Dict[str, Any]) -> str:
        """Scan results -> executive summary."""

    @abstractmethod
    async def generate_hypotheses(self, spec_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Sanitized spec metadata -> structured hypotheses (never auto-confirmed)."""
