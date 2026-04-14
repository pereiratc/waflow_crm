from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # incoming / outgoing
    message_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")  # text/image/document

    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # provider + storage metadata

    provider_message_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    provider_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")

