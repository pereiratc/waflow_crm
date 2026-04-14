import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.contacts import Contact
from app.models.user import User

router = APIRouter(prefix="/api/contacts", tags=["contacts"])
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


class ContactPatchRequest(BaseModel):
    full_name: str | None = Field(None, max_length=500)
    email: EmailStr | None = None
    owner_user_id: uuid.UUID | None = None
    status: str | None = Field(None, max_length=30)


@router.get("")
def list_contacts(
    q: str | None = Query(None, description="Search phone, name, or email (partial match)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = current_user.organization_id
    stmt = select(Contact).where(Contact.organization_id == org_id)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Contact.phone_number.ilike(term),
                Contact.full_name.ilike(term),
                Contact.email.ilike(term),
            )
        )
    stmt = stmt.order_by(Contact.updated_at.desc()).offset(offset).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return [
        {
            "id": str(c.id),
            "phone_number": c.phone_number,
            "full_name": c.full_name,
            "email": c.email,
            "owner_user_id": str(c.owner_user_id) if c.owner_user_id else None,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in rows
    ]


@router.get("/{contact_id}")
def get_contact(
    contact_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cid = uuid.UUID(contact_id)
    c = db.execute(
        select(Contact).where(Contact.id == cid, Contact.organization_id == current_user.organization_id)
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {
        "id": str(c.id),
        "phone_number": c.phone_number,
        "full_name": c.full_name,
        "email": c.email,
        "owner_user_id": str(c.owner_user_id) if c.owner_user_id else None,
        "status": c.status,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.patch("/{contact_id}")
def patch_contact(
    contact_id: str,
    body: ContactPatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"admin", "manager", "agent"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    cid = uuid.UUID(contact_id)
    c = db.execute(
        select(Contact).where(Contact.id == cid, Contact.organization_id == current_user.organization_id)
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")

    data = body.model_dump(exclude_unset=True)
    if "owner_user_id" in data:
        if data["owner_user_id"] is None:
            c.owner_user_id = None
        else:
            uid = data["owner_user_id"]
            u = db.execute(
                select(User).where(
                    User.id == uid,
                    User.organization_id == current_user.organization_id,
                    User.is_active.is_(True),
                )
            ).scalar_one_or_none()
            if not u:
                raise HTTPException(status_code=400, detail="Owner user not found")
            c.owner_user_id = uid

    if "full_name" in data:
        c.full_name = data["full_name"]
    if "email" in data:
        c.email = data["email"]
    if "status" in data and data["status"] is not None:
        c.status = data["status"]

    db.add(c)
    db.commit()
    return {"ok": True}
