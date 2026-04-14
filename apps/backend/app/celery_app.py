from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "waflow",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "automation-inactivity-scan": {
        "task": "app.tasks.automation.run_inactivity_scan",
        "schedule": 300.0,
    },
}

import app.models  # noqa: F401, E402 — metadata for ORM in workers

# Register task modules
import app.tasks.automation  # noqa: E402, F401
