import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.email import send_email
from app.core.security import decode_access_token
from app.models.automation_rules import AutomationRule
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(prefix="/api/billing", tags=["billing"])
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


@router.get("/usage")
def billing_usage(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.execute(
        select(Organization).where(Organization.id == current_user.organization_id)
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user_count = db.execute(
        select(func.count()).select_from(User).where(User.organization_id == org.id, User.is_active.is_(True))
    ).scalar_one()
    rule_count = db.execute(
        select(func.count()).select_from(AutomationRule).where(AutomationRule.organization_id == org.id)
    ).scalar_one()

    return {
        "plan": org.billing_plan,
        "stripe_customer_id": org.stripe_customer_id,
        "limits": {
            "users": org.max_users,
            "automation_rules": org.max_automation_rules,
        },
        "usage": {
            "users": int(user_count),
            "automation_rules": int(rule_count),
        },
    }


class MockSubscribeRequest(BaseModel):
    plan: Literal["pro", "free"] = "pro"


class TestEmailRequest(BaseModel):
    to: str | None = Field(None, description="Defaults to your login email")
    subject: str = Field(default="WaFlow CRM test email")
    body: str = Field(default="This is a test message from WaFlow CRM.")


@router.post("/mock/subscribe")
def mock_subscribe(
    body: MockSubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simulates a successful Stripe checkout without calling Stripe. Admin-only.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    org = db.execute(
        select(Organization).where(Organization.id == current_user.organization_id)
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if body.plan == "pro":
        org.billing_plan = "pro"
        org.max_users = 50
        org.max_automation_rules = 500
        if not org.stripe_customer_id:
            org.stripe_customer_id = f"cus_mock_{uuid.uuid4().hex[:16]}"
    else:
        org.billing_plan = "free"
        org.max_users = 5
        org.max_automation_rules = 10
        org.stripe_customer_id = None

    db.add(org)
    db.commit()
    return {"ok": True, "plan": org.billing_plan, "limits": {"users": org.max_users, "automation_rules": org.max_automation_rules}}


@router.post("/mock/webhook")
def mock_stripe_webhook(
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Simulates Stripe webhook: `{"type":"checkout.session.completed","organization_id":"<uuid>"}`.
    No signature verification (MVP). Use only in dev.
    """
    if body.get("type") != "checkout.session.completed":
        raise HTTPException(status_code=400, detail="Unsupported event type")

    org_id_raw = body.get("organization_id")
    if not org_id_raw:
        raise HTTPException(status_code=400, detail="organization_id required")

    org_id = uuid.UUID(str(org_id_raw))
    org = db.execute(select(Organization).where(Organization.id == org_id)).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.billing_plan = "pro"
    org.max_users = 50
    org.max_automation_rules = 500
    if not org.stripe_customer_id:
        org.stripe_customer_id = f"cus_mock_{uuid.uuid4().hex[:16]}"
    db.add(org)
    db.commit()
    return {"ok": True, "plan": org.billing_plan}


@router.post("/test-email")
def test_email(
    body: TestEmailRequest,
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Not allowed")
    to = body.to or current_user.email
    return send_email(to=to, subject=body.subject, body_text=body.body)
