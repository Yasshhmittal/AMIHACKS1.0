"""Normalized endpoint model + classification flags used across the engine."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Set

PATH_PARAM_RE = re.compile(r"\{([^}]+)\}")


@dataclass
class NormalizedEndpoint:
    method: str
    path: str
    operation_id: Optional[str] = None
    summary: Optional[str] = None
    spec_secured: bool = False
    object_bearing: bool = False
    admin_scoped: bool = False
    path_params: List[str] = field(default_factory=list)
    documented_response_fields: Set[str] = field(default_factory=set)
    owner_hint: Optional[str] = None
    id: Optional[int] = None  # DB id, filled after persistence

    @property
    def display(self) -> str:
        return f"{self.method} {self.path}"


def extract_path_params(path: str) -> List[str]:
    return PATH_PARAM_RE.findall(path)


def classify_object_bearing(path: str) -> bool:
    """An endpoint is object-bearing if it takes an id-like path parameter."""
    params = extract_path_params(path)
    return any(p.lower().endswith("id") or p.lower() == "id" for p in params)


def classify_admin_scoped(path: str, summary: Optional[str]) -> bool:
    hay = f"{path} {summary or ''}".lower()
    return "/admin" in path.lower() or "admin only" in hay or "(admin" in hay
