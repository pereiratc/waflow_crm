from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# Synchronous SQLAlchemy for foundation speed.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal: sessionmaker[Session] = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def db_execute(statement: Any) -> Any:
    """
    Placeholder helper for future repository layer.
    Kept minimal for MVP.
    """
    with SessionLocal() as db:
        return db.execute(statement)

