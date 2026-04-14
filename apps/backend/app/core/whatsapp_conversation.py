from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.models.conversations import Conversation

settings = get_settings()


def is_within_customer_service_window(conv: Conversation, now: datetime | None = None) -> bool:
    """
    Meta WhatsApp customer service window: free-form messages allowed for N hours after the
    customer's last inbound message. We use conversation.last_incoming_at as the anchor.
    """
    if conv.last_incoming_at is None:
        return False
    now = now or datetime.now(timezone.utc)
    anchor = conv.last_incoming_at
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=timezone.utc)
    delta = timedelta(hours=settings.conversation_window_hours)
    return now - anchor <= delta
