from app.routers.health import health


def test_health_returns_ok():
    assert health() == {"status": "ok"}
