import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://sentinel:sentinel_password@localhost:5432/sentinelapi"
    GROQ_API_KEY: Optional[str] = None
    GROQ_REASONING_MODEL: str = "openai/gpt-oss-120b"
    GROQ_FAST_MODEL: str = "openai/gpt-oss-20b"
    
    FERNET_KEY: str = ""
    SENTINEL_ALLOW_PUBLIC: str = "0"
    
    MAX_REQUESTS: int = 500
    MAX_CONCURRENT: int = 5
    CIRCUIT_BREAKER_ERROR_THRESHOLD: float = 0.30
    CIRCUIT_BREAKER_LATENCY_MULTIPLIER: float = 3.0
    REQUEST_TIMEOUT_SECONDS: float = 10.0
    SCAN_DEADLINE_SECONDS: int = 300
    
    SENTINELSHOP_PORT: int = 4000
    SENTINELSHOP_HOST: str = "0.0.0.0"
    SENTINEL_PORT: int = 8000
    SENTINEL_HOST: str = "0.0.0.0"

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
