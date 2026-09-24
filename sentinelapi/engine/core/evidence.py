"""Evidence helpers: stable fingerprints and reproducible PoC generation."""
from __future__ import annotations

import hashlib
from typing import Any, Dict, Optional


def generate_fingerprint(target_url: str, finding_class: str,
                         operation_id: Optional[str], param: Optional[str],
                         attacker_role: Optional[str]) -> str:
    raw = f"{target_url}:{finding_class}:{operation_id or ''}:{param or ''}:{attacker_role or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def build_curl_poc(method: str, url: str, token_placeholder: str = "$USER_A_TOKEN",
                   body: Optional[Any] = None) -> str:
    parts = [f"curl -i -X {method.upper()} '{url}'",
             f"  -H 'Authorization: Bearer {token_placeholder}'"]
    if body is not None:
        import json
        parts.append("  -H 'Content-Type: application/json'")
        parts.append(f"  -d '{json.dumps(body)}'")
    return " \\\n".join(parts)


def build_httpie_poc(method: str, url: str, token_placeholder: str = "$USER_A_TOKEN") -> str:
    return f"http {method.upper()} '{url}' 'Authorization:Bearer {token_placeholder}'"


def build_python_poc(method: str, url: str, token_placeholder: str = "$USER_A_TOKEN") -> str:
    return (
        "import httpx\n"
        f"r = httpx.request('{method.upper()}', '{url}',\n"
        f"    headers={{'Authorization': 'Bearer ' + {token_placeholder!r}}})\n"
        "print(r.status_code, r.json())"
    )


def build_pocs(method: str, url: str) -> Dict[str, str]:
    return {
        "curl": build_curl_poc(method, url),
        "httpie": build_httpie_poc(method, url),
        "python": build_python_poc(method, url),
    }
