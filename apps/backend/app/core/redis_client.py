from app.core.config import get_settings

settings = get_settings()

try:
    from redis import Redis

    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
except Exception:
    # During early foundation phases (or misconfigured env), still allow API to start.
    redis_client = None

