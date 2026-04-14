from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # MVP assumes WhatsApp only, but keeps the interface extensible.
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="whatsapp")

    # Meta phone number id (phone_number_id).
    whatsapp_phone_number_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    # Normalized conversation partner phone (digits only).
    external_phone: Mapped[str] = mapped_column(String(40), nullable=False)

    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    last_incoming_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()", onupdate="now()"
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "channel",
            "whatsapp_phone_number_id",
            "external_phone",
            name="uq_conversations_org_channel_phone",
        ),
    )

