import os
from typing import Dict, Optional, Any
from cryptography.fernet import Fernet
from ..config import settings

class IdentityVault:
    def __init__(self, key: Optional[str] = None):
        if not key:
            key = settings.FERNET_KEY
        if not key:
            # Generate a transient key if none configured
            key = Fernet.generate_key().decode()
        elif isinstance(key, str):
            key = key.strip()
            
        try:
            self.fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except Exception:
            # Fallback to fresh key if invalid string provided
            fresh_key = Fernet.generate_key()
            self.fernet = Fernet(fresh_key)

    def encrypt_credential(self, raw_credential: str) -> str:
        if not raw_credential:
            return ""
        return self.fernet.encrypt(raw_credential.encode()).decode()

    def decrypt_credential(self, encrypted_credential: str) -> str:
        if not encrypted_credential:
            return ""
        try:
            return self.fernet.decrypt(encrypted_credential.encode()).decode()
        except Exception:
            return ""

vault = IdentityVault()

class IdentitySession:
    def __init__(self, label: str, role: str, user_id: Optional[str] = None, raw_credential: Optional[str] = None):
        self.label = label
        self.role = role
        self.user_id = str(user_id) if user_id is not None else None
        self.raw_credential = raw_credential

    def get_auth_headers(self) -> Dict[str, str]:
        """Builds standard Authorization header if identity has credentials."""
        if not self.raw_credential or self.label == "anonymous":
            return {}
        
        token = self.raw_credential.strip()
        if token.lower().startswith("bearer "):
            return {"Authorization": token}
        return {"Authorization": f"Bearer {token}"}
