from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings

settings = get_settings()


def _graph_base(phone_number_id: str) -> str:
    v = settings.whatsapp_graph_api_version.strip().lstrip("/")
    return f"https://graph.facebook.com/{v}/{phone_number_id}"


def _headers() -> dict[str, str]:
    token = settings.whatsapp_access_token
    if not token:
        raise HTTPException(status_code=503, detail="WHATSAPP_ACCESS_TOKEN is not configured")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _raise_meta_error(resp: httpx.Response) -> None:
    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text[:2000]}
    err = data.get("error") if isinstance(data, dict) else None
    msg = err.get("message") if isinstance(err, dict) else str(data)
    code = err.get("code") if isinstance(err, dict) else None
    detail: dict[str, Any] = {"provider": "meta", "status": resp.status_code, "message": msg}
    if code is not None:
        detail["code"] = code
    raise HTTPException(status_code=502, detail=detail)


def send_text_message(*, phone_number_id: str, to_digits: str, body: str) -> dict[str, Any]:
    url = f"{_graph_base(phone_number_id)}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_digits,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }
    with httpx.Client(timeout=45.0) as client:
        r = client.post(url, json=payload, headers=_headers())
    if r.status_code >= 400:
        _raise_meta_error(r)
    return r.json()


def send_template_message(
    *,
    phone_number_id: str,
    to_digits: str,
    template_name: str,
    language_code: str,
    body_parameters: list[str] | None = None,
) -> dict[str, Any]:
    url = f"{_graph_base(phone_number_id)}/messages"
    tpl: dict[str, Any] = {
        "name": template_name,
        "language": {"code": language_code},
    }
    if body_parameters:
        tpl["components"] = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": p} for p in body_parameters],
            }
        ]
    payload = {
        "messaging_product": "whatsapp",
        "to": to_digits,
        "type": "template",
        "template": tpl,
    }
    with httpx.Client(timeout=45.0) as client:
        r = client.post(url, json=payload, headers=_headers())
    if r.status_code >= 400:
        _raise_meta_error(r)
    return r.json()


def send_media_message(
    *,
    phone_number_id: str,
    to_digits: str,
    media_type: str,
    media_id: str,
    caption: str | None = None,
) -> dict[str, Any]:
    """
    media_type: image | document | audio | video (WhatsApp Cloud API message type).
    """
    url = f"{_graph_base(phone_number_id)}/messages"
    block: dict[str, Any] = {"id": media_id}
    if caption and media_type in {"image", "video", "document"}:
        block["caption"] = caption
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_digits,
        "type": media_type,
        media_type: block,
    }
    with httpx.Client(timeout=45.0) as client:
        r = client.post(url, json=payload, headers=_headers())
    if r.status_code >= 400:
        _raise_meta_error(r)
    return r.json()


def upload_media_file(*, phone_number_id: str, file_bytes: bytes, mime_type: str) -> str:
    """
    Uploads bytes to Meta and returns the media id used in send_media_message.
    """
    _headers()
    token = settings.whatsapp_access_token
    assert token
    url = f"{_graph_base(phone_number_id)}/media"
    data = {"messaging_product": "whatsapp", "type": mime_type}
    files = {"file": ("upload", file_bytes, mime_type)}
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=120.0) as client:
        r = client.post(url, data=data, files=files, headers=headers)
    if r.status_code >= 400:
        _raise_meta_error(r)
    out = r.json()
    mid = out.get("id")
    if not mid:
        raise HTTPException(status_code=502, detail={"provider": "meta", "message": "Missing media id", "body": out})
    return str(mid)


def extract_sent_message_id(response: dict[str, Any]) -> str | None:
    messages = response.get("messages") if isinstance(response, dict) else None
    if not messages or not isinstance(messages, list):
        return None
    first = messages[0] if messages else None
    if isinstance(first, dict):
        return first.get("id")
    return None
