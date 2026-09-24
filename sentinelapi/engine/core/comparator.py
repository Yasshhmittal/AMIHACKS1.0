import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple

COMMON_OWNER_KEYS = [
    "userid", "user_id", "ownerid", "owner_id", "accountid", "account_id",
    "customerid", "customer_id", "creatorid", "creator_id", "authorid", "author_id"
]

COMMON_VOLATILE_KEYS = [
    "timestamp", "time", "date", "created_at", "updated_at", "createdat", "updatedat",
    "requestid", "request_id", "trace_id", "traceid", "nonce", "etag", "expires_in", "duration"
]

SENSITIVE_NAME_PATTERNS = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"passwordhash", re.IGNORECASE),
    re.compile(r".*_hash$", re.IGNORECASE),
    re.compile(r"salt", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"apikey", re.IGNORECASE),
    re.compile(r"api_key", re.IGNORECASE),
    re.compile(r"privatekey", re.IGNORECASE),
    re.compile(r"private_key", re.IGNORECASE),
    re.compile(r"ssn", re.IGNORECASE),
    re.compile(r"aadhaar", re.IGNORECASE),
    re.compile(r"cardnumber", re.IGNORECASE),
    re.compile(r"cvv", re.IGNORECASE),
    re.compile(r"otp", re.IGNORECASE),
    re.compile(r"internal", re.IGNORECASE),
    re.compile(r"adminflag", re.IGNORECASE),
    re.compile(r"refreshtoken", re.IGNORECASE),
    re.compile(r"sessionid", re.IGNORECASE),
    re.compile(r"credit_score", re.IGNORECASE),
    re.compile(r"creditscore", re.IGNORECASE)
]

VALUE_PATTERNS = [
    (re.compile(r"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$"), "bcrypt_hash"),
    (re.compile(r"^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$"), "jwt_token")
]

def normalize_scalar(val: Any) -> Any:
    """Converts scalars to normalized string representations when comparing IDs."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, str):
        return val.strip().strip("'\"")
    return val

def canonicalize(data: Any) -> Any:
    """
    Recursively sorts keys in dictionaries and normalizes scalar values.
    """
    if isinstance(data, dict):
        return {k: canonicalize(v) for k, v in sorted(data.items())}
    elif isinstance(data, list):
        return [canonicalize(item) for item in data]
    return normalize_scalar(data)

def unwrap_envelope(data: Any) -> Any:
    """Unwraps common single-key API envelopes like {'data': ...} or {'items': ...}."""
    if isinstance(data, dict):
        for env_key in ("data", "items", "results", "payload"):
            if env_key in data and len(data) == 1:
                return data[env_key]
    return data

def flatten_keys(data: Any, prefix: str = "") -> List[Tuple[str, Any]]:
    """Flattens a JSON structure into (dot_path, value) pairs."""
    items = []
    if isinstance(data, dict):
        for k, v in data.items():
            path = f"{prefix}.{k}" if prefix else k
            items.append((path, v))
            items.extend(flatten_keys(v, path))
    elif isinstance(data, list):
        for idx, elem in enumerate(data):
            path = f"{prefix}[{idx}]"
            items.append((path, elem))
            items.extend(flatten_keys(elem, path))
    return items

def find_owner_field(body: Any, hint: Optional[str] = None) -> Optional[str]:
    """
    Finds the owner identifier in a response body.
    First checks explicitly provided hint (e.g. 'userId'), then falls back to heuristics.
    Returns normalized string of the owner ID.
    """
    if not isinstance(body, (dict, list)):
        return None

    unwrapped = unwrap_envelope(body)
    pairs = flatten_keys(unwrapped)

    # 1. Hint check
    if hint:
        hint_lower = hint.lower()
        for path, val in pairs:
            if path.split(".")[-1].lower() == hint_lower and val is not None:
                return str(normalize_scalar(val))

    # 2. Heuristic check
    for path, val in pairs:
        leaf = path.split(".")[-1].lower()
        if leaf in COMMON_OWNER_KEYS and val is not None:
            return str(normalize_scalar(val))

    return None

def find_sensitive_fields(body: Any) -> List[str]:
    """
    Scans response body for field names or values matching sensitive patterns.
    Returns list of matching field paths.
    """
    sensitive_found = []
    pairs = flatten_keys(body)
    
    for path, val in pairs:
        leaf = path.split(".")[-1]
        
        # Check field name
        if any(pat.search(leaf) for pat in SENSITIVE_NAME_PATTERNS):
            sensitive_found.append(path)
            continue
            
        # Check value pattern (bcrypt, JWT)
        if isinstance(val, str):
            for regex, _ in VALUE_PATTERNS:
                if regex.match(val):
                    sensitive_found.append(f"{path} (matches sensitive value)")
                    break

    return list(set(sensitive_found))

def learn_volatility(body1: Any, body2: Any) -> Set[str]:
    """
    Compares two identical consecutive responses and returns set of keys that changed.
    """
    volatile = set()
    pairs1 = dict(flatten_keys(body1))
    pairs2 = dict(flatten_keys(body2))
    
    all_keys = set(pairs1.keys()).union(set(pairs2.keys()))
    for k in all_keys:
        v1 = pairs1.get(k)
        v2 = pairs2.get(k)
        if v1 != v2:
            leaf = k.split(".")[-1]
            volatile.add(leaf)
            
    for k in COMMON_VOLATILE_KEYS:
        volatile.add(k)
        
    return volatile

def prune_volatile(data: Any, volatile_keys: Set[str]) -> Any:
    """Removes volatile keys before equivalence comparison."""
    if isinstance(data, dict):
        return {
            k: prune_volatile(v, volatile_keys)
            for k, v in data.items()
            if k.lower() not in volatile_keys
        }
    elif isinstance(data, list):
        return [prune_volatile(x, volatile_keys) for x in data]
    return data

def body_equivalent(body1: Any, body2: Any, volatile_keys: Optional[Set[str]] = None) -> bool:
    """
    Determines if two bodies are functionally equivalent after canonicalization
    and volatile field suppression.
    """
    if volatile_keys is None:
        volatile_keys = set(COMMON_VOLATILE_KEYS)
        
    p1 = prune_volatile(canonicalize(body1), volatile_keys)
    p2 = prune_volatile(canonicalize(body2), volatile_keys)
    
    return json.dumps(p1, sort_keys=True) == json.dumps(p2, sort_keys=True)
