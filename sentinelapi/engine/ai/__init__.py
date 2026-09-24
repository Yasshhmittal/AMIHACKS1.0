"""AI layer factory. Returns Groq when a key is present, else the template NullProvider."""
from __future__ import annotations

from functools import lru_cache

from ..config import settings
from .provider import AIProvider


@lru_cache(maxsize=1)
def get_ai_provider() -> AIProvider:
    if settings.GROQ_API_KEY:
        from .groq_provider import GroqProvider
        return GroqProvider()
    from .null_provider import NullProvider
    return NullProvider()
