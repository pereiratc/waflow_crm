import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import User

router = APIRouter(prefix="/api/team", tags=["team"])
bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = uuid.UUID(str(payload.get("sub")))
    org_id = uuid.UUID(str(payload.get("org")))

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not user or not user.is_active or user.organization_id != org_id:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/users")
def list_org_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.execute(
        select(User)
        .where(User.organization_id == current_user.organization_id, User.is_active.is_(True))
        .order_by(User.email.asc())
    ).scalars().all()

    return [
        {"id": str(u.id), "email": u.email, "full_name": u.full_name, "role": u.role}
        for u in users
    ]
