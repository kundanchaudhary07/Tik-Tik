from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Step 1 HTTP Foundation: Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"
    assert "architecture" in data


def test_basic_health():
    """Step 1 & 22: Basic health check."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "uptime_seconds" in data


def test_liveness_probe():
    """Step 22: Liveness probe confirms process is alive."""
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "alive"


def test_readiness_probe():
    """Step 22: Readiness probe confirms PostgreSQL database connectivity."""
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"


def test_admin_health_forbidden_without_auth():
    """Step 11 Authorization: Unauthenticated request to /admin/health returns 401."""
    response = client.get("/admin/health")
    assert response.status_code == 401


def test_admin_health_forbidden_for_regular_user():
    """Step 11 Authorization: Regular USER role gets 403 Forbidden."""
    # Login as regular user
    login_resp = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "UserPassword123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    admin_resp = client.get(
        "/admin/health",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert admin_resp.status_code == 403
    assert admin_resp.json()["error"]["code"] == "FORBIDDEN"


def test_admin_health_allowed_for_admin():
    """Step 11 Authorization: ADMIN role gets 200 OK."""
    login_resp = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "AdminPassword123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    admin_resp = client.get(
        "/admin/health",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert admin_resp.status_code == 200
    assert admin_resp.json()["status"] == "admin_healthy"
