import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.contacts import Contact
from app.models.leads import Lead
from app.models.pipeline_stages import PipelineStage
from app.models.pipelines import Pipeline
from app.models.user import User
from app.models.lead_stage_history import LeadStageHistory

router = APIRouter(prefix="/api", tags=["pipeline"])
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


class PipelineStageIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_final: bool = False


class PipelineCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None
    stages: list[PipelineStageIn] = Field(min_length=1, max_length=20)


class LeadCreateRequest(BaseModel):
    contact_id: uuid.UUID
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID | None = None
    value: str | None = None
    priority: str = "normal"  # low/normal/high/urgent
    source: str | None = None
    assigned_user_id: uuid.UUID | None = None


class LeadStageMoveRequest(BaseModel):
    stage_id: uuid.UUID
    note: str | None = None


class LeadPatchRequest(BaseModel):
    assigned_user_id: uuid.UUID | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None


@router.post("/pipelines")
def create_pipeline(
    body: PipelineCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    pipeline = Pipeline(
        organization_id=current_user.organization_id,
        name=body.name,
        description=body.description,
    )
    db.add(pipeline)
    db.flush()

    stages: list[PipelineStage] = []
    for idx, stage in enumerate(body.stages):
        stages.append(
            PipelineStage(
                pipeline_id=pipeline.id,
                name=stage.name,
                stage_order=idx,
                is_final=stage.is_final,
            )
        )

    db.add_all(stages)
    db.commit()

    return {"id": str(pipeline.id)}


@router.get("/pipelines")
def list_pipelines(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pipelines = db.execute(
        select(Pipeline).where(Pipeline.organization_id == current_user.organization_id).order_by(Pipeline.created_at.desc())
    ).scalars().all()

    return [
        {"id": str(p.id), "name": p.name, "description": p.description, "created_at": p.created_at.isoformat()}
        for p in pipelines
    ]


@router.get("/pipelines/{pipeline_id}/stages")
def list_pipeline_stages(
    pipeline_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stages = db.execute(
        select(PipelineStage)
        .join(Pipeline, Pipeline.id == PipelineStage.pipeline_id)
        .where(PipelineStage.pipeline_id == pipeline_id, Pipeline.organization_id == current_user.organization_id)
        .order_by(PipelineStage.stage_order.asc())
    ).scalars().all()

    return [
        {
            "id": str(s.id),
            "name": s.name,
            "stage_order": s.stage_order,
            "is_final": s.is_final,
        }
        for s in stages
    ]


@router.post("/leads")
def create_lead(
    body: LeadCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager", "agent"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    pipeline = db.execute(
        select(Pipeline).where(Pipeline.id == body.pipeline_id, Pipeline.organization_id == current_user.organization_id)
    ).scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    stage_id = body.stage_id
    if stage_id is None:
        first = db.execute(
            select(PipelineStage).where(PipelineStage.pipeline_id == body.pipeline_id).order_by(PipelineStage.stage_order.asc())
        ).scalar_one_or_none()
        if not first:
            raise HTTPException(status_code=400, detail="Pipeline has no stages")
        stage_id = first.id

    # Ensure stage belongs to pipeline.
    stage = db.execute(
        select(PipelineStage).where(PipelineStage.id == stage_id, PipelineStage.pipeline_id == body.pipeline_id)
    ).scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    lead = Lead(
        organization_id=current_user.organization_id,
        contact_id=body.contact_id,
        pipeline_id=body.pipeline_id,
        current_stage_id=stage_id,
        value=body.value,
        priority=body.priority,
        source=body.source,
        assigned_user_id=body.assigned_user_id,
        status="open",
        is_converted=False,
    )
    db.add(lead)
    db.flush()

    history = LeadStageHistory(lead_id=lead.id, stage_id=stage_id, changed_by_user_id=current_user.id, note=None)
    db.add(history)
    db.commit()

    return {"id": str(lead.id)}


@router.get("/leads")
def list_leads(
    pipeline_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Lead, Contact.phone_number, Contact.full_name)
        .outerjoin(Contact, Lead.contact_id == Contact.id)
        .where(Lead.organization_id == current_user.organization_id)
    )
    if pipeline_id is not None:
        q = q.where(Lead.pipeline_id == pipeline_id)
    q = q.order_by(Lead.created_at.desc()).offset(offset).limit(limit)
    rows = db.execute(q).all()

    out = []
    for row in rows:
        l = row[0]
        phone = row[1]
        name = row[2]
        out.append(
            {
                "id": str(l.id),
                "contact_id": str(l.contact_id) if l.contact_id else None,
                "contact_phone": phone,
                "contact_name": name,
                "pipeline_id": str(l.pipeline_id) if l.pipeline_id else None,
                "current_stage_id": str(l.current_stage_id) if l.current_stage_id else None,
                "priority": l.priority,
                "value": str(l.value) if l.value is not None else None,
                "status": l.status,
                "assigned_user_id": str(l.assigned_user_id) if l.assigned_user_id else None,
            }
        )
    return out


@router.get("/leads/{lead_id}")
def get_lead(
    lead_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.execute(
        select(Lead, Contact.phone_number, Contact.full_name)
        .outerjoin(Contact, Lead.contact_id == Contact.id)
        .where(Lead.id == lead_id, Lead.organization_id == current_user.organization_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")
    l, phone, name = row[0], row[1], row[2]
    return {
        "id": str(l.id),
        "contact_id": str(l.contact_id) if l.contact_id else None,
        "contact_phone": phone,
        "contact_name": name,
        "pipeline_id": str(l.pipeline_id) if l.pipeline_id else None,
        "current_stage_id": str(l.current_stage_id) if l.current_stage_id else None,
        "priority": l.priority,
        "value": str(l.value) if l.value is not None else None,
        "status": l.status,
        "source": l.source,
        "assigned_user_id": str(l.assigned_user_id) if l.assigned_user_id else None,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }


@router.patch("/leads/{lead_id}")
def patch_lead(
    lead_id: uuid.UUID,
    body: LeadPatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager", "agent"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    lead = db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.organization_id == current_user.organization_id)
    ).scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    data = body.model_dump(exclude_unset=True)
    if "assigned_user_id" in data:
        uid = data["assigned_user_id"]
        if uid is None:
            lead.assigned_user_id = None
        else:
            u = db.execute(
                select(User).where(User.id == uid, User.organization_id == current_user.organization_id, User.is_active.is_(True))
            ).scalar_one_or_none()
            if not u:
                raise HTTPException(status_code=400, detail="User not found")
            lead.assigned_user_id = uid
    if "priority" in data and data["priority"] is not None:
        lead.priority = data["priority"]

    db.add(lead)
    db.commit()
    return {"ok": True}


@router.patch("/leads/{lead_id}/stage")
def move_lead_stage(
    lead_id: uuid.UUID,
    body: LeadStageMoveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "manager", "agent"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    lead = db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.organization_id == current_user.organization_id)
    ).scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if lead.current_stage_id == body.stage_id:
        return {"ok": True, "unchanged": True}

    old_stage_id = lead.current_stage_id

    stage = db.execute(
        select(PipelineStage).where(PipelineStage.id == body.stage_id)
    ).scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    lead.current_stage_id = body.stage_id
    db.add(lead)

    history = LeadStageHistory(
        lead_id=lead.id,
        stage_id=body.stage_id,
        changed_by_user_id=current_user.id,
        note=body.note,
    )
    db.add(history)
    db.commit()

    try:
        from app.tasks.automation import on_stage_changed_task

        on_stage_changed_task.delay(
            str(current_user.organization_id),
            str(lead.id),
            str(old_stage_id) if old_stage_id else None,
            str(body.stage_id),
        )
    except Exception:
        pass

    return {"ok": True}

