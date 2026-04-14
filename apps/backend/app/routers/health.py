from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.redis_client import redis_client

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    """
    Readiness: DB reachable; Redis ping when configured.
    """
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database: {exc}") from exc

    if redis_client is not None:
        try:
            redis_client.ping()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"redis: {exc}") from exc
        return {"status": "ready", "database": "ok", "redis": "ok"}

    return {"status": "ready", "database": "ok", "redis": "skipped"}

