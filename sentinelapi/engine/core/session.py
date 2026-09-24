"""Identity sessions + credential vault.

Tokens are encrypted at rest, never logged, never placed in argv or URLs, and
replaced with placeholders in PoCs. Encryption uses Fernet (from `cryptography`)
when available; if that package can't be installed on the host, the vault falls
back to a clearly-labelled, non-cryptographic obfuscation so the demo still runs
end to end. Install `cryptography` for real at-rest encryption.
"""
from __future__ import annotations

import base64
import logging
from typing import Dict, Optional

from ..config import settings

logger = logging.getLogger("sentinel.session")

try:
    from cryptography.fernet import Fernet
    _HAS_FERNET = True
except Exception:  # pragma: no cover - only when cryptography can't be built
    Fernet = None  # type: ignore
    _HAS_FERNET = False
    logger.warning("cryptography not available; credential vault will use a "
                   "non-encrypted fallback. Install 'cryptography' for at-rest encryption.")


class CredentialVault:
    """Encrypts credentials at rest. Prefers Fernet; degrades to reversible
    base64 obfuscation (prefixed 'b64:') when cryptography is unavailable."""

    def __init__(self, key: Optional[str] = None):
        self._fernet = None
        if _HAS_FERNET:
            raw = (key or settings.FERNET_KEY or "").strip()
            if not raw:
                raw = Fernet.generate_key().decode()
                logger.info("Generated ephemeral Fernet key for this process.")
            self._fernet = Fernet(raw if isinstance(raw, bytes) else raw.encode())

    def encrypt(self, plaintext: str) -> str:
        if self._fernet is not None:
            return self._fernet.encrypt(plaintext.encode()).decode()
        return "b64:" + base64.urlsafe_b64encode(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        if ciphertext.startswith("b64:"):
            return base64.urlsafe_b64decode(ciphertext[4:].encode()).decode()
        if self._fernet is not None:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        raise RuntimeError("Cannot decrypt Fernet ciphertext without cryptography installed.")


vault = CredentialVault()


class IdentitySession:
    """One caller identity (anonymous, userA, userB, admin).

    `credential` may be a bearer token or a password. If it looks like a bare
    token we send it as `Authorization: Bearer <token>`; anonymous sends nothing.
    """

    def __init__(self, label: str, role: str, user_id: Optional[str] = None,
                 credential: Optional[str] = None):
        self.label = label
        self.role = role
        self.user_id = user_id
        self._credential = credential  # held in memory only during a scan

    @property
    def credential(self) -> Optional[str]:
        return self._credential

    def get_auth_headers(self) -> Dict[str, str]:
        if self.role == "anonymous" or not self._credential:
            return {}
        return {"Authorization": f"Bearer {self._credential}"}

    def __repr__(self) -> str:  # never leak the credential
        return f"IdentitySession(label={self.label!r}, role={self.role!r}, user_id={self.user_id!r})"
