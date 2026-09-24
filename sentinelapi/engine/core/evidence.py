import hashlib
import json
from typing import Dict, Any, Optional

def generate_fingerprint(target_url: str, finding_class: str, operation_id: str, param: str = "", attacker_role: str = "") -> str:
    """
    Generates a deterministic fingerprint for deduplication and fix tracking.
    """
    raw = f"{target_url}:{finding_class}:{operation_id}:{param}:{attacker_role}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

def build_curl_poc(method: str, url: str, headers: Dict[str, str], body: Optional[Any] = None, token_placeholder: str = "$USER_TOKEN") -> str:
    """
    Constructs a reproducible cURL command with sanitized token placeholders.
    """
    parts = [f"curl -X {method.upper()} \"{url}\""]

    # Header flags
    for k, v in headers.items():
        if k.lower() == "authorization":
            parts.append(f"-H \"Authorization: Bearer {token_placeholder}\"")
        elif k.lower() not in {"cookie", "set-cookie"}:
            parts.append(f"-H \"{k}: {v}\"")

    # Body flag
    if body and method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        body_str = json.dumps(body) if isinstance(body, (dict, list)) else str(body)
        parts.append(f"-H \"Content-Type: application/json\" -d '{body_str}'")

    return " \\\n  ".join(parts)

def build_httpie_poc(method: str, url: str, headers: Dict[str, str], body: Optional[Any] = None) -> str:
    parts = [f"http {method.upper()} \"{url}\""]
    if "authorization" in [k.lower() for k in headers]:
        parts.append('"Authorization: Bearer $USER_TOKEN"')
    if body and isinstance(body, dict):
        for k, v in body.items():
            parts.append(f"{k}='{v}'")
    return " ".join(parts)

def build_python_poc(method: str, url: str, headers: Dict[str, str], body: Optional[Any] = None) -> str:
    return f"""import requests

url = "{url}"
headers = {{
    "Authorization": "Bearer YOUR_TOKEN_HERE",
    "Content-Type": "application/json"
}}
{f'data = {json.dumps(body, indent=4)}' if body else ''}
response = requests.{method.lower()}(url, headers=headers{', json=data' if body else ''})
print("Status:", response.status_code)
print("Response:", response.text)
"""
