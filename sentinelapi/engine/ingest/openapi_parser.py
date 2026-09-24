"""OpenAPI 3.x ingestion via prance ($ref resolution, JSON + YAML) with a plain
PyYAML/json fallback. Produces the normalized endpoint inventory.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml

from .api_model import (NormalizedEndpoint, classify_admin_scoped,
                        classify_object_bearing, extract_path_params)

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}


def _load_raw(spec_text: str) -> Dict[str, Any]:
    text = spec_text.strip()
    if text.startswith("{"):
        return json.loads(text)
    return yaml.safe_load(text)


def _resolve_with_prance(spec_text: str) -> Optional[Dict[str, Any]]:
    try:
        import tempfile
        import os
        from prance import ResolvingParser

        suffix = ".json" if spec_text.strip().startswith("{") else ".yaml"
        with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False) as fh:
            fh.write(spec_text)
            tmp = fh.name
        try:
            parser = ResolvingParser(tmp, strict=False, backend="openapi-spec-validator")
            return parser.specification
        finally:
            os.unlink(tmp)
    except Exception:
        return None


def resolve_spec_secured(op: Dict[str, Any], spec: Dict[str, Any]) -> bool:
    """operation-level security:[] means explicitly public and overrides the doc default."""
    if "security" in op:
        return len(op["security"]) > 0
    if "security" in spec:
        return len(spec["security"]) > 0
    return False


def _documented_response_fields(op: Dict[str, Any]) -> Set[str]:
    fields: Set[str] = set()

    def walk(schema: Any):
        if not isinstance(schema, dict):
            return
        if schema.get("type") == "object" or "properties" in schema:
            for name, sub in (schema.get("properties") or {}).items():
                fields.add(name)
                walk(sub)
        if "items" in schema:
            walk(schema["items"])
        for key in ("allOf", "anyOf", "oneOf"):
            for sub in schema.get(key, []) or []:
                walk(sub)

    for resp in (op.get("responses") or {}).values():
        if not isinstance(resp, dict):
            continue
        for content in (resp.get("content") or {}).values():
            walk(content.get("schema") or {})
    return fields


def _owner_hints(spec: Dict[str, Any]) -> List[Dict[str, str]]:
    return spec.get("x-sentinel-collection-hints", []) or []


def _hint_for_path(path: str, hints: List[Dict[str, str]]) -> Optional[str]:
    # match the longest hint prefix
    best = None
    for h in hints:
        hp = h.get("path", "")
        if path.startswith(hp) and (best is None or len(hp) > len(best.get("path", ""))):
            best = h
    return best.get("ownerField") if best else None


def parse_openapi_spec(spec_text: str) -> Tuple[List[NormalizedEndpoint], Dict[str, Any]]:
    """Return (endpoints, raw_spec_dict)."""
    raw = _resolve_with_prance(spec_text) or _load_raw(spec_text)
    hints = _owner_hints(raw)
    endpoints: List[NormalizedEndpoint] = []

    for path, item in (raw.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        for method, op in item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(op, dict):
                continue
            secured = resolve_spec_secured(op, raw)
            ep = NormalizedEndpoint(
                method=method.upper(),
                path=path,
                operation_id=op.get("operationId"),
                summary=op.get("summary"),
                spec_secured=secured,
                object_bearing=classify_object_bearing(path),
                admin_scoped=classify_admin_scoped(path, op.get("summary")),
                path_params=extract_path_params(path),
                documented_response_fields=_documented_response_fields(op),
                owner_hint=_hint_for_path(path, hints),
            )
            endpoints.append(ep)
    return endpoints, raw
