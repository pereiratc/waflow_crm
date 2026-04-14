from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(*, to: str, subject: str, body_text: str) -> dict:
    """
    Sends email via SMTP when configured; otherwise logs and returns mock status.
    """
    settings = get_settings()
    if not settings.smtp_host or not settings.email_from:
        logger.info("email (mock): to=%s subject=%s body=%s", to, subject, body_text[:500])
        return {"ok": True, "mode": "mock", "detail": "SMTP not configured; logged only"}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.email_from, [to], msg.as_string())

    return {"ok": True, "mode": "smtp"}
