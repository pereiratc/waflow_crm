from fastapi.testclient import TestClient

from app.main import app


def test_inbox_metrics_requires_auth():
    with TestClient(app) as client:
        r = client.get("/api/inbox/metrics")
        assert r.status_code == 401


def test_get_lead_requires_auth():
    import uuid

    with TestClient(app) as client:
        r = client.get(f"/api/leads/{uuid.uuid4()}")
        assert r.status_code == 401


def test_contacts_list_requires_auth():
    with TestClient(app) as client:
        r = client.get("/api/contacts")
        assert r.status_code == 401


def test_whatsapp_phone_routes_requires_auth():
    with TestClient(app) as client:
        r = client.get("/api/whatsapp/phone-routes")
        assert r.status_code == 401
