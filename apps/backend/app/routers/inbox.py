import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.redis_client import redis_client
from app.core.security import decode_access_token
from app.core.whatsapp_cloud import (
    extract_sent_message_id,
    send_media_message,
    send_template_message,
    send_text_message,
    upload_media_file,
)
from app.core.whatsapp_conversation import is_within_customer_service_window
from app.models.conversation_messages import ConversationMessage
from app.models.conversations import Conversation
from app.models.message_attachments import MessageAttachment
from app.models.user import User

router = APIRouter(prefix="/api/inbox", tags=["inbox"])
bearer_scheme = HTTPBearer(auto_error=True)
settings = get_settings()

MAX_UPLOAD_BYTES = 16 * 1024 * 1024


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    out = re.sub(r"[^a-zA-Z0-9._-]", "_", base)[:120]
    return out or "file"


def _mime_to_whatsapp_media_type(mime: str) -> str:
    m = (mime or "").split(";")[0].strip().lower()
    if m.startswith("image/"):
        return "image"
    if m.startswith("video/"):
        return "video"
    if m.startswith("audio/"):
        return "audio"
    return "document"


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


@router.get("/conversations")
def list_conversations(
    assigned_user_id: str | None = Query(
        None,
        description='Filter by assignee UUID, or "unassigned" for no assignee.',
    ),
    awaiting_reply: bool | None = Query(None, description="If true, only threads where last message is incoming."),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = current_user.organization_id
    convs = db.execute(
        select(Conversation)
        .where(Conversation.organization_id == org_id)
        .order_by(Conversation.last_message_at.desc().nullslast())
    ).scalars().all()

    out = []
    for c in convs:
        last_dir = db.execute(
            select(ConversationMessage.direction)
            .where(ConversationMessage.conversation_id == c.id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        ar = last_dir == "incoming" if last_dir else False

        if assigned_user_id:
            if assigned_user_id == "unassigned":
                if c.assigned_user_id is not None:
                    continue
            else:
                if str(c.assigned_user_id or "") != assigned_user_id:
                    continue
        if awaiting_reply is not None and ar != awaiting_reply:
            continue

        out.append(
            {
                "id": str(c.id),
                "external_phone": c.external_phone,
                "assigned_user_id": str(c.assigned_user_id) if c.assigned_user_id else None,
                "status": c.status,
                "last_incoming_at": c.last_incoming_at.isoformat() if c.last_incoming_at else None,
                "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
                "awaiting_reply": ar,
            }
        )
    return out[offset : offset + limit]


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = current_user.organization_id
    conv_uuid = uuid.UUID(conversation_id)
    c = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.organization_id == org_id)
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Conversation not found")

    last_dir = db.execute(
        select(ConversationMessage.direction)
        .where(ConversationMessage.conversation_id == c.id)
        .order_by(ConversationMessage.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    ar = last_dir == "incoming" if last_dir else False

    return {
        "id": str(c.id),
        "external_phone": c.external_phone,
        "assigned_user_id": str(c.assigned_user_id) if c.assigned_user_id else None,
        "status": c.status,
        "channel": c.channel,
        "last_incoming_at": c.last_incoming_at.isoformat() if c.last_incoming_at else None,
        "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
        "awaiting_reply": ar,
    }


@router.get("/metrics")
def inbox_metrics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Aggregate counts for dashboards: total threads, awaiting customer reply, unassigned, assigned to you.
    """
    org_id = current_user.organization_id
    convs = db.execute(select(Conversation).where(Conversation.organization_id == org_id)).scalars().all()

    awaiting_reply = 0
    unassigned = 0
    assigned_to_me = 0
    for c in convs:
        if c.assigned_user_id is None:
            unassigned += 1
        if c.assigned_user_id == current_user.id:
            assigned_to_me += 1
        last_dir = db.execute(
            select(ConversationMessage.direction)
            .where(ConversationMessage.conversation_id == c.id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if last_dir == "incoming":
            awaiting_reply += 1

    return {
        "conversations_total": len(convs),
        "awaiting_reply": awaiting_reply,
        "unassigned": unassigned,
        "assigned_to_me": assigned_to_me,
    }


class ConversationPatchRequest(BaseModel):
    assigned_user_id: str | None = Field(None, description="Set assignee user id, or null to unassign")


@router.patch("/conversations/{conversation_id}")
def patch_conversation(
    conversation_id: str,
    body: ConversationPatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = current_user.organization_id
    conv_uuid = uuid.UUID(conversation_id)
    conv = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.organization_id == org_id)
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    data = body.model_dump(exclude_unset=True)
    if "assigned_user_id" in data:
        raw = data["assigned_user_id"]
        if raw is None or raw == "":
            conv.assigned_user_id = None
        else:
            assignee = db.execute(
                select(User).where(User.id == uuid.UUID(str(raw)), User.organization_id == org_id, User.is_active.is_(True))
            ).scalar_one_or_none()
            if not assignee:
                raise HTTPException(status_code=400, detail="Assignee not found in organization")
            conv.assigned_user_id = assignee.id
    db.add(conv)
    db.commit()
    return {"ok": True, "assigned_user_id": str(conv.assigned_user_id) if conv.assigned_user_id else None}


@router.get("/conversations/{conversation_id}/messages")
def list_conversation_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = current_user.organization_id
    conv_uuid = uuid.UUID(conversation_id)

    # Verify conversation belongs to tenant.
    conv = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.organization_id == org_id)
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conv_uuid)
        .order_by(ConversationMessage.created_at.asc())
    ).scalars().all()

    return [
        {
            "id": str(m.id),
            "direction": m.direction,
            "message_type": m.message_type,
            "content_text": m.content_text,
            "provider_message_id": m.provider_message_id,
            "provider_timestamp": m.provider_timestamp.isoformat() if m.provider_timestamp else None,
            "created_at": m.created_at.isoformat(),
            "attachment": m.attachment,
        }
        for m in msgs
    ]


class SendWhatsAppRequest(BaseModel):
    text: str | None = Field(
        None,
        description="Free-form text; allowed only inside the customer service window (see WHATSAPP_CONVERSATION_WINDOW_HOURS, default 24).",
    )
    template_name: str | None = Field(
        None,
        description="Meta-approved template name. Required when outside the window; optional inside the window.",
    )
    template_language: str = "en_US"
    template_body_params: list[str] | None = None
    media_id: str | None = Field(None, description="WhatsApp media id (from Meta upload).")
    media_type: str | None = Field(None, description="image | document | audio | video")
    attachment_id: str | None = Field(None, description="Local attachment id from POST .../attachments")
    caption: str | None = None


@router.post("/conversations/{conversation_id}/attachments")
async def upload_conversation_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save an uploaded file locally (MVP persistence) for later outbound send via attachment_id.
    Max size 16MB (WhatsApp limit). Also uploads are intended for WhatsApp media sends.
    """
    org_id = current_user.organization_id
    conv_uuid = uuid.UUID(conversation_id)
    conv = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.organization_id == org_id)
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.channel != "whatsapp":
        raise HTTPException(status_code=400, detail="Attachments are only supported for WhatsApp conversations")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 16MB)")

    mime = file.content_type or "application/octet-stream"
    safe = _safe_filename(file.filename or "upload")
    rel = f"{org_id}/{uuid.uuid4().hex}_{safe}"
    root = Path(settings.media_upload_dir)
    dest = root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)

    row = MessageAttachment(
        organization_id=org_id,
        conversation_id=conv.id,
        storage_relative_path=rel,
        mime_type=mime,
        original_filename=file.filename,
        byte_size=len(raw),
        meta_media_id=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "mime_type": row.mime_type,
        "byte_size": row.byte_size,
        "original_filename": row.original_filename,
    }


@router.post("/conversations/{conversation_id}/send")
def send_whatsapp_message(
    conversation_id: str,
    body: SendWhatsAppRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send an outbound WhatsApp message via Cloud API.

    * Inside the customer service window (24h after last inbound message by default): send `text`,
      or media via `media_id`+`media_type`, or `attachment_id` (local file uploaded to Meta then sent).
    * Outside that window: send a **template** (`template_name`, `template_language`, optional
      `template_body_params`). Free-form `text` is rejected until the customer messages again.
    """
    org_id = current_user.organization_id
    conv_uuid = uuid.UUID(conversation_id)
    conv = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.organization_id == org_id)
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.channel != "whatsapp":
        raise HTTPException(status_code=400, detail="Only WhatsApp conversations are supported")

    in_window = is_within_customer_service_window(conv)
    phone_number_id = conv.whatsapp_phone_number_id
    to_digits = conv.external_phone

    text = (body.text or "").strip() if body.text else ""
    wants_template = bool(body.template_name and body.template_name.strip())
    wants_media = bool(body.media_id and body.media_type)
    wants_attachment = bool(body.attachment_id)
    wants_text = bool(text)

    if wants_template:
        name = body.template_name.strip() if body.template_name else ""
        resp = send_template_message(
            phone_number_id=phone_number_id,
            to_digits=to_digits,
            template_name=name,
            language_code=body.template_language.strip(),
            body_parameters=body.template_body_params,
        )
        provider_id = extract_sent_message_id(resp)
        now = datetime.now(timezone.utc)
        msg = ConversationMessage(
            conversation_id=conv.id,
            direction="outgoing",
            message_type="template",
            content_text=name,
            attachment={"template": name, "language": body.template_language, "params": body.template_body_params},
            provider_message_id=provider_id,
            provider_timestamp=now,
        )
        db.add(msg)
        conv.last_message_at = now
        db.add(conv)
        db.commit()
        db.refresh(msg)
        _publish_outgoing(org_id, conv.id, msg.id)
        return {"ok": True, "provider_message_id": provider_id, "mode": "template"}

    if not in_window:
        raise HTTPException(
            status_code=400,
            detail=(
                "Outside the customer service window; use a WhatsApp template (template_name) "
                f"or wait for the customer to message you (window is {settings.conversation_window_hours}h "
                "after their last inbound message)."
            ),
        )

    # Inside window: text, explicit media id, or persisted attachment upload.
    if wants_text and not wants_media and not wants_attachment:
        resp = send_text_message(phone_number_id=phone_number_id, to_digits=to_digits, body=text)
        provider_id = extract_sent_message_id(resp)
        now = datetime.now(timezone.utc)
        msg = ConversationMessage(
            conversation_id=conv.id,
            direction="outgoing",
            message_type="text",
            content_text=text,
            attachment=None,
            provider_message_id=provider_id,
            provider_timestamp=now,
        )
        db.add(msg)
        conv.last_message_at = now
        db.add(conv)
        db.commit()
        db.refresh(msg)
        _publish_outgoing(org_id, conv.id, msg.id)
        return {"ok": True, "provider_message_id": provider_id, "mode": "text"}

    if wants_media:
        mt = (body.media_type or "").strip().lower()
        if mt not in {"image", "document", "audio", "video"}:
            raise HTTPException(status_code=400, detail="media_type must be image, document, audio, or video")
        cap = (body.caption or "").strip() or None
        resp = send_media_message(
            phone_number_id=phone_number_id,
            to_digits=to_digits,
            media_type=mt,
            media_id=body.media_id.strip(),
            caption=cap,
        )
        provider_id = extract_sent_message_id(resp)
        now = datetime.now(timezone.utc)
        msg = ConversationMessage(
            conversation_id=conv.id,
            direction="outgoing",
            message_type=mt,
            content_text=cap,
            attachment={"provider": "meta", "media_id": body.media_id, "type": mt},
            provider_message_id=provider_id,
            provider_timestamp=now,
        )
        db.add(msg)
        conv.last_message_at = now
        db.add(conv)
        db.commit()
        db.refresh(msg)
        _publish_outgoing(org_id, conv.id, msg.id)
        return {"ok": True, "provider_message_id": provider_id, "mode": "media"}

    if wants_attachment:
        att_id = uuid.UUID(body.attachment_id)
        att = db.execute(
            select(MessageAttachment).where(
                MessageAttachment.id == att_id,
                MessageAttachment.organization_id == org_id,
                MessageAttachment.conversation_id == conv.id,
            )
        ).scalar_one_or_none()
        if not att:
            raise HTTPException(status_code=404, detail="Attachment not found")
        root = Path(settings.media_upload_dir)
        path = root / att.storage_relative_path
        if not path.is_file():
            raise HTTPException(status_code=400, detail="Attachment file missing on server")
        file_bytes = path.read_bytes()
        mid = att.meta_media_id
        if not mid:
            mid = upload_media_file(phone_number_id=phone_number_id, file_bytes=file_bytes, mime_type=att.mime_type)
            att.meta_media_id = mid
            db.add(att)
            db.flush()
        mt = _mime_to_whatsapp_media_type(att.mime_type)
        cap = (body.caption or "").strip() or None
        resp = send_media_message(
            phone_number_id=phone_number_id,
            to_digits=to_digits,
            media_type=mt,
            media_id=mid,
            caption=cap,
        )
        provider_id = extract_sent_message_id(resp)
        now = datetime.now(timezone.utc)
        msg = ConversationMessage(
            conversation_id=conv.id,
            direction="outgoing",
            message_type=mt,
            content_text=cap,
            attachment={
                "provider": "meta",
                "media_id": mid,
                "type": mt,
                "local_attachment_id": str(att.id),
                "storage_relative_path": att.storage_relative_path,
            },
            provider_message_id=provider_id,
            provider_timestamp=now,
        )
        db.add(msg)
        conv.last_message_at = now
        db.add(conv)
        db.commit()
        db.refresh(msg)
        _publish_outgoing(org_id, conv.id, msg.id)
        return {"ok": True, "provider_message_id": provider_id, "mode": "attachment"}

    raise HTTPException(
        status_code=400,
        detail="Provide template_name (outside window), or inside the window: text, media_id+media_type, or attachment_id.",
    )


def _publish_outgoing(org_id: uuid.UUID, conv_id: uuid.UUID, msg_id: uuid.UUID) -> None:
    if redis_client is None:
        return
    try:
        redis_client.publish(
            "realtime:events",
            json.dumps(
                {
                    "type": "conversation.outgoing_message",
                    "org_id": str(org_id),
                    "conversation_id": str(conv_id),
                    "message_id": str(msg_id),
                }
            ),
        )
    except Exception:
        pass

