import time
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_registration_success():
    """Step 8: Register new account."""
    unique_email = f"test_{int(time.time())}@example.com"
    response = client.post(
        "/auth/register",
        json={
            "email": unique_email,
            "password": "SecurePassword123!",
            "name": "Test User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "Verification link sent" in data["detail"]
    assert "dev_token" in data
    assert data["dev_token"] is not None


def test_registration_duplicate_email():
    """Step 8: Reject duplicate registration with 409 Conflict."""
    response = client.post(
        "/auth/register",
        json={
            "email": "user@example.com",
            "password": "AnotherPassword123!",
            "name": "Duplicate User",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"


def test_registration_validation_failure():
    """Step 20: 422 Unprocessable Entity on short password."""
    response = client.post(
        "/auth/register",
        json={"email": "badpass@example.com", "password": "short"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_login_invalid_password():
    """Step 9: Generic 401 error on bad credentials."""
    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_and_protected_me():
    """Step 9 & 10: Login and fetch /auth/me."""
    login_resp = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "UserPassword123!"},
    )
    assert login_resp.status_code == 200
    token_data = login_resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Access protected /me
    me_resp = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    user_data = me_resp.json()
    assert user_data["email"] == "user@example.com"
    assert user_data["role"] == "USER"


def test_email_verification_flow():
    """Step 13: Register -> unverified -> verify with token -> verified."""
    unique_email = f"verify_{int(time.time())}@example.com"
    reg_resp = client.post(
        "/auth/register",
        json={"email": unique_email, "password": "StrongPassword123!"},
    )
    assert reg_resp.status_code == 201
    token = reg_resp.json()["dev_token"]

    # Verify email
    verify_resp = client.post("/auth/verify-email", json={"token": token})
    assert verify_resp.status_code == 200
    assert "successfully verified" in verify_resp.json()["message"]

    # Re-using the same token must fail (single-use)
    replay_resp = client.post("/auth/verify-email", json={"token": token})
    assert replay_resp.status_code == 400
    assert replay_resp.json()["error"]["code"] == "INVALID_OR_EXPIRED_TOKEN"


def test_password_reset_flow():
    """Step 14: Forgot password -> reset password -> login with new password."""
    unique_email = f"reset_{int(time.time())}@example.com"
    reg_resp = client.post(
        "/auth/register",
        json={"email": unique_email, "password": "OldPassword123!"},
    )
    assert reg_resp.status_code == 201

    # Request reset
    forgot_resp = client.post("/auth/forgot-password", json={"email": unique_email})
    assert forgot_resp.status_code == 200
    reset_token = forgot_resp.json()["dev_token"]
    assert reset_token is not None

    # Reset with new password
    reset_resp = client.post(
        "/auth/reset-password",
        json={"token": reset_token, "new_password": "BrandNewPassword123!"},
    )
    assert reset_resp.status_code == 200

    # Old password no longer works
    old_login = client.post(
        "/auth/login",
        json={"email": unique_email, "password": "OldPassword123!"},
    )
    assert old_login.status_code == 401

    # New password works
    new_login = client.post(
        "/auth/login",
        json={"email": unique_email, "password": "BrandNewPassword123!"},
    )
    assert new_login.status_code == 200


def test_logout_token_revocation():
    """Step 15: Logout revokes JWT token."""
    login_resp = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "UserPassword123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Valid before logout
    me_resp1 = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp1.status_code == 200

    # Logout
    logout_resp = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_resp.status_code == 200

    # Rejected after logout (401)
    me_resp2 = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp2.status_code == 401
    assert me_resp2.json()["error"]["code"] == "TOKEN_REVOKED"
