"""
Execute automation rule actions. Kept synchronous so Celery tasks and tests can call it directly.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.redis_client import redis_client
from app.models.automation_runs import AutomationRun
from app.models.automation_rules import AutomationRule
from app.models.conversation_messages import ConversationMessage
from app.models.conversations import Conversation
from app.models.leads import Lead
from app.models.user import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_actions(actions: dict | list | None) -> list[dict[str, Any]]:
    if actions is None:
        return []
    if isinstance(actions, list):
        return [a for a in actions if isinstance(a, dict)]
    if isinstance(actions, dict):
        if "type" in actions:
            return [actions]
        return [v for v in actions.values() if isinstance(v, dict)]
    return []


def _cooldown_allows(
    db: Session,
    *,
    rule_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    lead_id: uuid.UUID | None,
    cooldown_minutes: int,
) -> bool:
    if cooldown_minutes <= 0:
        return True
    since = _now() - timedelta(minutes=cooldown_minutes)
    q = select(AutomationRun.id).where(AutomationRun.rule_id == rule_id, AutomationRun.created_at >= since)
    if conversation_id is not None:
        q = q.where(AutomationRun.conversation_id == conversation_id)
    if lead_id is not None:
        q = q.where(AutomationRun.lead_id == lead_id)
    row = db.execute(q.limit(1)).scalar_one_or_none()
    return row is None


def _log_run(
    db: Session,
    *,
    rule: AutomationRule,
    trigger_type: str,
    status: str,
    conversation_id: uuid.UUID | None,
    lead_id: uuid.UUID | None,
    detail: dict | None,
) -> None:
    run = AutomationRun(
        rule_id=rule.id,
        organization_id=rule.organization_id,
        conversation_id=conversation_id,
        lead_id=lead_id,
        trigger_type=trigger_type,
        status=status,
        detail=detail,
    )
    db.add(run)
    db.commit()


def _action_assign_conversation(db: Session, org_id: uuid.UUID, action: dict[str, Any], ctx: dict[str, Any]) -> str | None:
    cid = ctx.get("conversation_id")
    uid = action.get("user_id")
    if not cid or not uid:
        return "assign_conversation missing conversation_id or user_id"
    conv = db.execute(
        select(Conversation).where(Conversation.id == uuid.UUID(str(cid)), Conversation.organization_id == org_id)
    ).scalar_one_or_none()
    if not conv:
        return "conversation not found"
    user = db.execute(select(User).where(User.id == uuid.UUID(str(uid)), User.organization_id == org_id)).scalar_one_or_none()
    if not user:
        return "user not found"
    conv.assigned_user_id = user.id
    db.add(conv)
    db.commit()
    return None


def _action_assign_lead(db: Session, org_id: uuid.UUID, action: dict[str, Any], ctx: dict[str, Any]) -> str | None:
    lid = ctx.get("lead_id")
    uid = action.get("user_id")
    if not lid or not uid:
        return "assign_lead missing lead_id or user_id"
    lead = db.execute(select(Lead).where(Lead.id == uuid.UUID(str(lid)), Lead.organization_id == org_id)).scalar_one_or_none()
    if not lead:
        return "lead not found"
    user = db.execute(select(User).where(User.id == uuid.UUID(str(uid)), User.organization_id == org_id)).scalar_one_or_none()
    if not user:
        return "user not found"
    lead.assigned_user_id = user.id
    db.add(lead)
    db.commit()
    return None


def _action_realtime_notify(org_id: uuid.UUID, action: dict[str, Any], ctx: dict[str, Any]) -> str | None:
    if redis_client is None:
        return "redis unavailable"
    payload = action.get("payload") if isinstance(action.get("payload"), dict) else {}
    body = {
        "type": "automation.notify",
        "org_id": str(org_id),
        "rule_name": ctx.get("rule_name"),
        "conversation_id": ctx.get("conversation_id"),
        "lead_id": ctx.get("lead_id"),
        **payload,
    }
    try:
        redis_client.publish("realtime:events", json.dumps(body))
    except Exception as exc:
        return str(exc)
    return None


def _action_tag_contact(db: Session, org_id: uuid.UUID, action: dict[str, Any], ctx: dict[str, Any]) -> str | None:
    """Placeholder until contact.tags exists; does not fail the rule."""
    _ = db, org_id, action, ctx
    return None


def execute_rule_actions(
    db: Session,
    rule: AutomationRule,
    trigger_type: str,
    context: dict[str, Any],
) -> None:
    org_id = rule.organization_id
    ctx = {**context, "rule_name": rule.name}
    actions = _normalize_actions(rule.actions)
    errors: list[str] = []
    for act in actions:
        atype = (act.get("type") or "").strip().lower()
        err: str | None = None
        if atype == "realtime_notify":
            err = _action_realtime_notify(org_id, act, ctx)
        elif atype == "assign_conversation":
            err = _action_assign_conversation(db, org_id, act, ctx)
        elif atype == "assign_lead":
            err = _action_assign_lead(db, org_id, act, ctx)
        elif atype == "tag_contact":
            err = _action_tag_contact(db, org_id, act, ctx)
        else:
            err = f"unknown action type: {atype or 'missing'}"
        if err:
            errors.append(err)

    detail = {"actions": len(actions), "errors": errors} if errors else {"actions": len(actions)}
    _log_run(
        db,
        rule=rule,
        trigger_type=trigger_type,
        status="error" if errors else "success",
        conversation_id=uuid.UUID(str(context["conversation_id"])) if context.get("conversation_id") else None,
        lead_id=uuid.UUID(str(context["lead_id"])) if context.get("lead_id") else None,
        detail=detail,
    )


def last_message_for_conversation(db: Session, conversation_id: uuid.UUID) -> ConversationMessage | None:
    return db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def matches_inactivity(
    db: Session,
    conv: Conversation,
    conditions: dict[str, Any],
) -> bool:
    if conv.channel != conditions.get("channel", "whatsapp"):
        return False
    if not conv.last_incoming_at:
        return False
    last = last_message_for_conversation(db, conv.id)
    if conditions.get("require_last_message_incoming", True):
        if not last or last.direction != "incoming":
            return False
    minutes = int(conditions.get("minutes_since_last_incoming") or 60)
    anchor = conv.last_incoming_at
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=timezone.utc)
    if _now() - anchor < timedelta(minutes=minutes):
        return False
    return True


def matches_stage_changed(conditions: dict[str, Any], old_stage_id: uuid.UUID | None, new_stage_id: uuid.UUID) -> bool:
    if not conditions:
        return True
    if tid := conditions.get("to_stage_id"):
        if str(new_stage_id) != str(tid):
            return False
    if fid := conditions.get("from_stage_id"):
        if str(old_stage_id or "") != str(fid):
            return False
    return True


def matches_message_received(conditions: dict[str, Any], ctx: dict[str, Any]) -> bool:
    """Optional filters e.g. channel."""
    if ch := conditions.get("channel"):
        if ctx.get("channel") != ch:
            return False
    return True


def run_inactivity_scan_db(db: Session) -> int:
    rules = db.execute(
        select(AutomationRule).where(
            AutomationRule.enabled.is_(True),
            AutomationRule.trigger_type == "inactivity",
        )
    ).scalars().all()
    fired = 0
    for rule in rules:
        cond = rule.conditions if isinstance(rule.conditions, dict) else {}
        org_id = rule.organization_id
        convs = db.execute(
            select(Conversation).where(
                Conversation.organization_id == org_id,
                Conversation.channel == cond.get("channel", "whatsapp"),
            )
        ).scalars().all()
        for conv in convs:
            if not matches_inactivity(db, conv, cond):
                continue
            cd = int(cond.get("cooldown_minutes", 1440))
            if not _cooldown_allows(db, rule_id=rule.id, conversation_id=conv.id, lead_id=None, cooldown_minutes=cd):
                continue
            execute_rule_actions(
                db,
                rule,
                "inactivity",
                {"conversation_id": str(conv.id), "organization_id": str(org_id)},
            )
            fired += 1
    return fired


def run_stage_changed_db(
    db: Session,
    *,
    organization_id: uuid.UUID,
    lead_id: uuid.UUID,
    old_stage_id: uuid.UUID | None,
    new_stage_id: uuid.UUID,
) -> None:
    lead = db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.organization_id == organization_id)
    ).scalar_one_or_none()
    if not lead:
        return
    rules = db.execute(
        select(AutomationRule).where(
            AutomationRule.organization_id == organization_id,
            AutomationRule.enabled.is_(True),
            AutomationRule.trigger_type == "stage_changed",
        )
    ).scalars().all()
    for rule in rules:
        cond = rule.conditions if isinstance(rule.conditions, dict) else {}
        if not matches_stage_changed(cond, old_stage_id, new_stage_id):
            continue
        cd = int(cond.get("cooldown_minutes", 0))
        if not _cooldown_allows(db, rule_id=rule.id, conversation_id=None, lead_id=lead.id, cooldown_minutes=cd):
            continue
        execute_rule_actions(
            db,
            rule,
            "stage_changed",
            {
                "lead_id": str(lead.id),
                "organization_id": str(organization_id),
                "old_stage_id": str(old_stage_id) if old_stage_id else None,
                "new_stage_id": str(new_stage_id),
                "contact_id": str(lead.contact_id) if lead.contact_id else None,
            },
        )


def run_message_received_db(
    db: Session,
    *,
    organization_id: uuid.UUID,
    conversation_id: uuid.UUID,
    channel: str,
) -> None:
    rules = db.execute(
        select(AutomationRule).where(
            AutomationRule.organization_id == organization_id,
            AutomationRule.enabled.is_(True),
            AutomationRule.trigger_type == "message_received",
        )
    ).scalars().all()
    for rule in rules:
        cond = rule.conditions if isinstance(rule.conditions, dict) else {}
        if not matches_message_received(cond, {"channel": channel}):
            continue
        cd = int(cond.get("cooldown_minutes", 0))
        if not _cooldown_allows(db, rule_id=rule.id, conversation_id=conversation_id, lead_id=None, cooldown_minutes=cd):
            continue
        execute_rule_actions(
            db,
            rule,
            "message_received",
            {
                "conversation_id": str(conversation_id),
                "organization_id": str(organization_id),
                "channel": channel,
            },
        )
