from __future__ import annotations

import uuid

from app.celery_app import celery_app
from app.core.db import SessionLocal
from app.services.automation_engine import (
    run_inactivity_scan_db,
    run_message_received_db,
    run_stage_changed_db,
)


@celery_app.task(name="app.tasks.automation.run_inactivity_scan")
def run_inactivity_scan() -> int:
    db = SessionLocal()
    try:
        return run_inactivity_scan_db(db)
    finally:
        db.close()


@celery_app.task(name="app.tasks.automation.on_stage_changed")
def on_stage_changed_task(
    organization_id: str,
    lead_id: str,
    old_stage_id: str | None,
    new_stage_id: str,
) -> None:
    db = SessionLocal()
    try:
        run_stage_changed_db(
            db,
            organization_id=uuid.UUID(organization_id),
            lead_id=uuid.UUID(lead_id),
            old_stage_id=uuid.UUID(old_stage_id) if old_stage_id else None,
            new_stage_id=uuid.UUID(new_stage_id),
        )
    finally:
        db.close()


@celery_app.task(name="app.tasks.automation.on_message_received")
def on_message_received_task(organization_id: str, conversation_id: str, channel: str) -> None:
    db = SessionLocal()
    try:
        run_message_received_db(
            db,
            organization_id=uuid.UUID(organization_id),
            conversation_id=uuid.UUID(conversation_id),
            channel=channel,
        )
    finally:
        db.close()
