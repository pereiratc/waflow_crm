from uuid import UUID

from pydantic import BaseModel


class OrganizationOut(BaseModel):
    id: UUID
    name: str
    slug: str
    timezone: str

