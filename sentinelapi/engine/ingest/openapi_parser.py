import re
import json
import yaml
from typing import Dict, Any, List, Tuple
from .api_model import NormalizedEndpoint

def resolve_spec_secured(op: Dict[str, Any], spec: Dict[str, Any]) -> bool:
    """
    OpenAPI 3 Rule:
    Operation-level security overrides top-level.
    `security: []` explicitly declares an endpoint as public!
    """
    if "security" in op:
        return len(op["security"]) > 0
    if "security" in spec:
        return len(spec["security"]) > 0
    return False

def extract_schema_field_names(schema: Dict[str, Any]) -> List[str]:
    """Recursively collects property names declared in response schema."""
    fields = []
    if not isinstance(schema, dict):
        return fields
        
    if "properties" in schema and isinstance(schema["properties"], dict):
        for k, v in schema["properties"].items():
            fields.append(k)
            fields.extend(extract_schema_field_names(v))
    elif "items" in schema and isinstance(schema["items"], dict):
        fields.extend(extract_schema_field_names(schema["items"]))
        
    return list(set(fields))

def parse_openapi_spec(raw_content: str) -> Tuple[Dict[str, Any], List[NormalizedEndpoint]]:
    """
    Parses OpenAPI 3.x spec from JSON or YAML string.
    Returns parsed dictionary and list of NormalizedEndpoint objects.
    """
    try:
        spec_dict = json.loads(raw_content)
    except Exception:
        spec_dict = yaml.safe_load(raw_content)

    endpoints: List[NormalizedEndpoint] = []
    paths = spec_dict.get("paths", {})

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue

        for method in ("get", "post", "put", "delete", "patch", "options", "head"):
            if method not in path_item:
                continue

            op = path_item[method]
            if not isinstance(op, dict):
                continue

            operation_id = op.get("operationId", f"{method}_{path.replace('/', '_').replace('{', '').replace('}', '')}")
            summary = op.get("summary", "")
            
            # Security determination
            is_secured = resolve_spec_secured(op, spec_dict)

            # Object bearing determination (contains path parameters like {id})
            path_params = re.findall(r"\{([a-zA-Z0-9_]+)\}", path)
            is_object_bearing = len(path_params) > 0

            # Admin scoped determination
            is_admin_scoped = ("/admin/" in path.lower()) or ("admin" in summary.lower()) or ("admin" in operation_id.lower())

            # Response schema fields extraction for 2xx responses
            response_fields = []
            responses = op.get("responses", {})
            for code, res_obj in responses.items():
                if str(code).startswith("2") and isinstance(res_obj, dict):
                    content = res_obj.get("content", {})
                    for media_type in ("application/json", "*/*"):
                        if media_type in content:
                            schema = content[media_type].get("schema", {})
                            response_fields.extend(extract_schema_field_names(schema))

            # Query params
            query_params = []
            for param in op.get("parameters", []):
                if isinstance(param, dict) and param.get("in") == "query":
                    query_params.append(param.get("name", ""))

            # Owner hint heuristic
            owner_hint = None
            if "order" in path.lower():
                owner_hint = "userId"
            elif "user" in path.lower():
                owner_hint = "id"

            endpoints.append(NormalizedEndpoint(
                method=method.upper(),
                path=path,
                operation_id=operation_id,
                summary=summary,
                spec_secured=is_secured,
                object_bearing=is_object_bearing,
                admin_scoped=is_admin_scoped,
                path_params=path_params,
                query_params=query_params,
                response_schema_fields=list(set(response_fields)),
                owner_hint=owner_hint,
                raw_operation=op
            ))

    return spec_dict, endpoints
