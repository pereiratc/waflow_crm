from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_files() -> tuple[str, ...]:
    """
    Load env from repo root first, then apps/backend/.env (later wins).
    Works when uvicorn is started from WAflow_crm or from apps/backend.
    """
    backend_root = Path(__file__).resolve().parent.parent.parent
    repo_root = backend_root.parent.parent
    out: list[str] = []
    for p in (repo_root / ".env", backend_root / ".env"):
        if p.is_file():
            out.append(str(p))
    return tuple(out)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files() or None,
        extra="ignore",
        case_sensitive=False,
    )

    # Core
    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(alias="REDIS_URL")

    # Auth
    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_expires_seconds: int = Field(alias="JWT_EXPIRES_SECONDS", default=86400)

    # Seed admin (dev/portfolio-friendly)
    seed_admin: bool = Field(alias="SEED_ADMIN", default=False)
    seed_admin_org_name: str = Field(alias="SEED_ADMIN_ORG_NAME", default="Demo Org")
    seed_admin_email: str = Field(alias="SEED_ADMIN_EMAIL", default="admin@demo.local")
    seed_admin_password: str = Field(alias="SEED_ADMIN_PASSWORD", default="admin12345")

    # Foundation ergonomics
    auto_create_tables: bool = Field(alias="AUTO_CREATE_TABLES", default=True)
    testing: bool = Field(alias="TESTING", default=False)

    # CORS: comma-separated browser origins (e.g. https://app.example.com,https://www.example.com)
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        alias="CORS_ORIGINS",
    )

    # WhatsApp (Meta Cloud API) integration
    whatsapp_verify_token: str = Field(alias="WHATSAPP_VERIFY_TOKEN", default="dev-verify-token")
    whatsapp_app_secret: str | None = Field(alias="WHATSAPP_APP_SECRET", default=None)
    whatsapp_access_token: str | None = Field(alias="WHATSAPP_ACCESS_TOKEN", default=None)
    whatsapp_graph_api_version: str = Field(alias="WHATSAPP_GRAPH_API_VERSION", default="v21.0")
    conversation_window_hours: int = Field(alias="WHATSAPP_CONVERSATION_WINDOW_HOURS", default=24)
    media_upload_dir: str = Field(alias="MEDIA_UPLOAD_DIR", default="./data/media")

    # Email (optional; if SMTP not set, send is logged only)
    smtp_host: str | None = Field(alias="SMTP_HOST", default=None)
    smtp_port: int = Field(alias="SMTP_PORT", default=587)
    smtp_user: str | None = Field(alias="SMTP_USER", default=None)
    smtp_password: str | None = Field(alias="SMTP_PASSWORD", default=None)
    email_from: str | None = Field(alias="EMAIL_FROM", default=None)
    smtp_use_tls: bool = Field(alias="SMTP_USE_TLS", default=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def cors_origins_list() -> list[str]:
    raw = get_settings().cors_origins
    return [x.strip() for x in raw.split(",") if x.strip()]

