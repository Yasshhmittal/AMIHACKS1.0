from dataclasses import dataclass, field
from typing import List, Optional, Any, Dict

@dataclass
class NormalizedEndpoint:
    method: str
    path: str
    operation_id: str
    summary: str
    spec_secured: bool = False
    object_bearing: bool = False
    admin_scoped: bool = False
    path_params: List[str] = field(default_factory=list)
    query_params: List[str] = field(default_factory=list)
    response_schema_fields: List[str] = field(default_factory=list)
    owner_hint: Optional[str] = None
    raw_operation: Dict[str, Any] = field(default_factory=dict)
