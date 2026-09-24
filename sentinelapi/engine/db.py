"""SQLite persistence via SQLModel.

A single synchronous engine is enough here: scans run in a background task and
write their results once at the end, so there is no hot write path. Using the
sync engine keeps the code simple and avoids an aiosqlite dependency.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

logger = logging.getLogger("sentinel.db")

# check_same_thread=False so the engine can be touched from the background
# scan task and the request thread. Writes are serialised by SQLite's WAL.
_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, echo=False, connect_args=_connect_args)


def init_db() -> None:
    """Create all tables. Import models first so they register on SQLModel.metadata."""
    from .models import tables  # noqa: F401  (registers table classes)

    SQLModel.metadata.create_all(engine)
    if settings.DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            from sqlalchemy import text

            conn.execute(text("PRAGMA journal_mode=WAL;"))
            conn.commit()
    logger.info("SQLite schema ready at %s", settings.DATABASE_URL)


@contextmanager
def get_session() -> Iterator[Session]:
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
