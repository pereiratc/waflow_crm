from uuid import UUID

from pydantic import BaseModel


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    organization_id: UUID
    is_active: bool


class UserMeOut(UserOut):
    organization_name: str
    billing_plan: str

