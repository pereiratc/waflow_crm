from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    timezone: Mapped[str] = mapped_column(String(60), nullable=False, default="UTC")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")

    # Billing (MVP: mock Stripe + plan limits)
    billing_plan: Mapped[str] = mapped_column(String(20), nullable=False, server_default="free")
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    max_automation_rules: Mapped[int] = mapped_column(Integer, nullable=False, server_default="10")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()", onupdate="now()"
    )

