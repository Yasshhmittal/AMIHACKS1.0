"""Central settings, loaded from environment / .env."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = two levels up from this file (engine/ -> sentinelapi/)
ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    # --- Database (SQLite via SQLModel) ---
    DATABASE_URL: str = f"sqlite:///{ROOT_DIR / 'sentinel.db'}"

    # --- AI / LLM (Groq free tier) ---
    GROQ_API_KEY: Optional[str] = None
    GROQ_REASONING_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.1-8b-instant"

    # --- Security ---
    FERNET_KEY: str = ""          # auto-generated on first run if empty
    SENTINEL_ALLOW_PUBLIC: str = "0"  # "1" allows non-sandbox targets

    # --- Engine budget / safety ---
    MAX_REQUESTS: int = 500
    MAX_CONCURRENT: int = 5
    CIRCUIT_BREAKER_ERROR_THRESHOLD: float = 0.30
    CIRCUIT_BREAKER_LATENCY_MULTIPLIER: float = 3.0
    REQUEST_TIMEOUT_SECONDS: float = 10.0
    SCAN_DEADLINE_SECONDS: int = 300

    # --- Demo target ---
    SENTINELSHOP_PORT: int = 4000
    SENTINELSHOP_HOST: str = "0.0.0.0"

    # --- Engine server ---
    SENTINEL_PORT: int = 8000
    SENTINEL_HOST: str = "0.0.0.0"

    @property
    def allow_public(self) -> bool:
        return str(self.SENTINEL_ALLOW_PUBLIC).strip() in ("1", "true", "True", "yes")


settings = Settings()
