import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.automation_rules import AutomationRule
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(prefix="/api/automation", tags=["automation"])
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


class AutomationRuleCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    enabled: bool = True
    trigger_type: str = Field(min_length=1, max_length=50)
    conditions: dict = Field(default_factory=dict)
    actions: dict = Field(default_factory=dict)


@router.post("/rules")
def create_rule(
    body: AutomationRuleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    org = db.execute(
        select(Organization).where(Organization.id == current_user.organization_id)
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    rule_count = db.execute(
        select(func.count()).select_from(AutomationRule).where(AutomationRule.organization_id == org.id)
    ).scalar_one()
    if int(rule_count) >= org.max_automation_rules:
        raise HTTPException(
            status_code=400,
            detail=f"Automation rule limit reached ({org.max_automation_rules} for plan {org.billing_plan})",
        )

    rule = AutomationRule(
        organization_id=current_user.organization_id,
        name=body.name,
        enabled=body.enabled,
        trigger_type=body.trigger_type,
        conditions=body.conditions,
        actions=body.actions,
    )
    db.add(rule)
    db.commit()
    return {"id": str(rule.id)}


@router.get("/rules")
def list_rules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rules = db.execute(
        select(AutomationRule).where(AutomationRule.organization_id == current_user.organization_id).order_by(AutomationRule.created_at.desc())
    ).scalars().all()

    return [
        {
            "id": str(r.id),
            "name": r.name,
            "enabled": r.enabled,
            "trigger_type": r.trigger_type,
            "conditions": r.conditions,
            "actions": r.actions,
        }
        for r in rules
    ]

