import base64
import hashlib
import hmac
import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.redis_client import redis_client
from app.models.contacts import Contact
from app.models.conversations import Conversation
from app.models.conversation_messages import ConversationMessage
from app.models.user import User
from app.core.security import decode_access_token
from app.models.webhook_events import WebhookEvent
from app.models.whatsapp_routes import WhatsappPhoneRoute

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
settings = get_settings()
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


class WhatsappPhoneRouteRequest(BaseModel):
    phone_number_id: str
    is_active: bool = True


def normalize_phone(phone: str) -> str:
    if not phone:
        return ""
    return re.sub(r"\D+", "", phone)


def verify_signature(request_body: bytes, signature: str | None) -> bool:
    """
    Meta sends X-Hub-Signature-256: sha256=<base64(hmac_sha256(body, app_secret))>
    """
    if not signature or not settings.whatsapp_app_secret:
        return True  # Signature verification disabled/missing secret for foundation.

    if signature.startswith("sha256="):
        signature = signature[len("sha256=") :]

    expected = hmac.new(
        settings.whatsapp_app_secret.encode("utf-8"),
        request_body,
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.b64encode(expected).decode("utf-8")
    return hmac.compare_digest(expected_b64, signature)


def extract_message_from_payload(payload: dict) -> dict | None:
    """
    Attempts to extract the latest message from a Meta webhook payload.
    Supports the most common Cloud API "messages" structure.
    """
    entries = payload.get("entry") or []
    if not entries:
        return None

    changes = entries[0].get("changes") or []
    if not changes:
        return None

    value = changes[0].get("value") or {}
    metadata = value.get("metadata") or {}
    phone_number_id = metadata.get("phone_number_id")

    messages = value.get("messages") or []
    if not messages:
        return None

    m = messages[0] or {}
    from_phone = m.get("from") or (value.get("contacts") or [{}])[0].get("wa_id")
    provider_message_id = m.get("id")

    timestamp_raw = m.get("timestamp") or m.get("timestamp_ms")
    ts: int | None = None
    if isinstance(timestamp_raw, str) and timestamp_raw.isdigit():
        ts = int(timestamp_raw)
    elif isinstance(timestamp_raw, (int, float)):
        ts = int(timestamp_raw)
    provider_ts = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None

    msg_type = m.get("type") or "text"
    content_text = None
    attachment = None

    if msg_type == "text":
        content_text = ((m.get("text") or {}) or {}).get("body")
    else:
        # Media: image, document, audio, video.
        type_block = m.get(msg_type) or {}
        if isinstance(type_block, dict):
            caption = type_block.get("caption")
            content_text = caption or None
            attachment = {
                "provider": "meta",
                "type": msg_type,
                "id": type_block.get("id"),
                "mime_type": type_block.get("mime_type"),
                "sha256": type_block.get("sha256"),
                "caption": caption,
            }

    return {
        "phone_number_id": phone_number_id,
        "from_phone": from_phone,
        "provider_message_id": provider_message_id,
        "provider_timestamp": provider_ts.isoformat() if provider_ts else None,
        "message_type": msg_type,
        "content_text": content_text,
        "attachment": attachment,
    }


@router.get("/webhook")
async def verify_webhook(
    request: Request,
):
    """
    Meta webhook verification:
    ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")

    if token != settings.whatsapp_verify_token:
        raise HTTPException(status_code=403, detail="Invalid verify token")

    if not challenge:
        raise HTTPException(status_code=400, detail="Missing hub.challenge")

    return {"challenge": challenge}


@router.post("/phone-route")
def upsert_phone_route(
    body: WhatsappPhoneRouteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    route = db.execute(
        select(WhatsappPhoneRoute).where(WhatsappPhoneRoute.phone_number_id == body.phone_number_id)
    ).scalar_one_or_none()

    if not route:
        route = WhatsappPhoneRoute(
            organization_id=current_user.organization_id,
            phone_number_id=body.phone_number_id,
            is_active=body.is_active,
        )
        db.add(route)
    else:
        route.organization_id = current_user.organization_id
        route.is_active = body.is_active

    db.commit()
    return {"ok": True}


@router.get("/phone-routes")
def list_phone_routes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = db.execute(
        select(WhatsappPhoneRoute)
        .where(WhatsappPhoneRoute.organization_id == current_user.organization_id)
        .order_by(WhatsappPhoneRoute.created_at.desc())
    ).scalars().all()

    return [
        {
            "id": str(r.id),
            "phone_number_id": r.phone_number_id,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# Shown in Swagger/OpenAPI so "Try it out" has a JSON body editor (no file upload).
# Replace phone_number_id with a value from POST /api/whatsapp/phone-route.
WHATSAPP_WEBHOOK_BODY_EXAMPLE = {
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
            "changes": [
                {
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "15555555555",
                            "phone_number_id": "YOUR_PHONE_NUMBER_ID",
                        },
                        "messages": [
                            {
                                "from": "491234567890",
                                "id": "wamid.xxx",
                                "timestamp": "1712345678",
                                "type": "text",
                                "text": {"body": "Hello from Swagger"},
                            }
                        ],
                    },
                    "field": "messages",
                }
            ],
        }
    ],
}


@router.post(
    "/webhook",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {"type": "object"},
                    "example": WHATSAPP_WEBHOOK_BODY_EXAMPLE,
                }
            },
        }
    },
)
async def handle_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Ingest Meta WhatsApp Cloud API webhooks. Paste JSON in the request body (Swagger: Request body).
    You do not upload a file. If WHATSAPP_APP_SECRET is set, send header X-Hub-Signature-256 from Meta
    or disable the secret for local tests.
    """
    raw = await request.body()
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    signature = request.headers.get("X-Hub-Signature-256")

    if not verify_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event = WebhookEvent(
        provider="whatsapp",
        provider_event_id=str(uuid.uuid4()),
        payload=payload,
        organization_id=None,
        processing_status="received",
        error_text=None,
    )
    db.add(event)
    db.commit()

    extracted = extract_message_from_payload(payload)
    if not extracted:
        event.processing_status = "ignored_no_message"
        db.add(event)
        db.commit()
        return {"ok": True, "ignored": True}

    phone_number_id = extracted["phone_number_id"]
    from_phone = normalize_phone(extracted["from_phone"])
    if not phone_number_id or not from_phone:
        event.processing_status = "ignored_missing_routing"
        db.add(event)
        db.commit()
        return {"ok": True, "ignored": True}

    route = db.execute(
        select(WhatsappPhoneRoute).where(
            WhatsappPhoneRoute.phone_number_id == phone_number_id, WhatsappPhoneRoute.is_active.is_(True)
        )
    ).scalar_one_or_none()

    if not route:
        event.processing_status = "error_no_route"
        event.error_text = f"No tenant route for phone_number_id={phone_number_id}"
        db.add(event)
        db.commit()
        return {"ok": True}

    org_id = route.organization_id
    event.organization_id = org_id
    db.add(event)
    db.commit()

    # Upsert contact.
    contact = db.execute(
        select(Contact).where(Contact.organization_id == org_id, Contact.phone_number == from_phone)
    ).scalar_one_or_none()

    if not contact:
        contact = Contact(
            organization_id=org_id,
            phone_number=from_phone,
            full_name=None,
            email=None,
            owner_user_id=None,
            status="active",
        )
        db.add(contact)
        db.flush()

    # Upsert conversation.
    conv = db.execute(
        select(Conversation).where(
            Conversation.organization_id == org_id,
            Conversation.channel == "whatsapp",
            Conversation.whatsapp_phone_number_id == phone_number_id,
            Conversation.external_phone == from_phone,
        )
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not conv:
        conv = Conversation(
            organization_id=org_id,
            channel="whatsapp",
            whatsapp_phone_number_id=phone_number_id,
            external_phone=from_phone,
            assigned_user_id=None,
            status="open",
            last_incoming_at=now,
            last_message_at=now,
        )
        db.add(conv)
        db.flush()
    else:
        conv.last_incoming_at = now
        conv.last_message_at = now

    # Store message.
    provider_ts_str = extracted["provider_timestamp"]
    provider_ts = datetime.fromisoformat(provider_ts_str) if provider_ts_str else None
    msg = ConversationMessage(
        conversation_id=conv.id,
        direction="incoming",
        message_type=extracted["message_type"],
        content_text=extracted["content_text"],
        attachment=extracted["attachment"],
        provider_message_id=extracted["provider_message_id"],
        provider_timestamp=provider_ts,
    )
    db.add(msg)

    db.add(conv)
    event.processing_status = "processed"
    db.add(event)
    db.commit()

    try:
        from app.tasks.automation import on_message_received_task

        on_message_received_task.delay(str(org_id), str(conv.id), "whatsapp")
    except Exception:
        pass

    # Push realtime update for inbox UI.
    if redis_client is not None:
        try:
            event_payload = {
                "type": "conversation.incoming_message",
                "org_id": str(org_id),
                "conversation_id": str(conv.id),
                "message_id": str(msg.id),
            }
            redis_client.publish("realtime:events", json.dumps(event_payload))
        except Exception:
            # Do not fail webhook if realtime publish fails.
            pass

    return {"ok": True}

