from abc import ABC, abstractmethod
from typing import Dict, Any, List

class AIProvider(ABC):
    @abstractmethod
    async def explain(self, finding_data: Dict[str, Any]) -> str:
        """Generates plain-English explanation + remediation code snippets."""
        pass

    @abstractmethod
    async def summarize(self, scan_summary_data: Dict[str, Any]) -> str:
        """Generates executive summary for audit reports."""
        pass

    @abstractmethod
    async def generate_hypotheses(self, spec_endpoints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generates targeted testing hypotheses based on sanitized endpoint metadata."""
        pass
