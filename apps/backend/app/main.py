from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import cors_origins_list, get_settings
from app.core.db import engine
from app.models.base import Base
from app.routers.auth import router as auth_router
from app.routers.health import router as health_router
from app.routers.whatsapp import router as whatsapp_router
from app.routers.inbox import router as inbox_router
from app.routers.pipeline import router as pipeline_router
from app.routers.automation import router as automation_router
from app.routers.billing import router as billing_router
from app.routers.team import router as team_router
from app.routers.contacts import router as contacts_router


def seed_admin_if_configured(db: Session) -> None:
    """
    Optional dev/portfolio seed.
    This runs only when `SEED_ADMIN=true`.
    """
    settings = get_settings()
    from app.core.security import hash_password
    from app.models.organization import Organization
    from app.models.user import User
    from sqlalchemy import select

    if not settings.seed_admin:
        return

    existing = db.execute(select(User).where(User.email == settings.seed_admin_email)).scalar_one_or_none()
    if existing:
        return

    # Reuse the same slugging as auth.register.
    from app.routers.auth import slugify

    org = Organization(
        name=settings.seed_admin_org_name,
        slug=slugify(settings.seed_admin_org_name),
        timezone="UTC",
    )
    db.add(org)
    db.flush()

    admin = User(
        organization_id=org.id,
        email=settings.seed_admin_email,
        password_hash=hash_password(settings.seed_admin_password),
        full_name="Admin",
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.auto_create_tables and not settings.testing:
        import app.models  # noqa: F401

        Base.metadata.create_all(bind=engine)

    if settings.seed_admin and not settings.testing:
        from app.core.db import SessionLocal

        db = SessionLocal()
        try:
            seed_admin_if_configured(db)
        finally:
            db.close()

    yield


app = FastAPI(title="WaFlow CRM", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(whatsapp_router)
app.include_router(inbox_router)
app.include_router(pipeline_router)
app.include_router(automation_router)
app.include_router(billing_router)
app.include_router(team_router)
app.include_router(contacts_router)
