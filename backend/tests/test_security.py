import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import hash_password, verify_password, create_access_token
from app.core.rate_limit import auth_rate_limiter

client = TestClient(app)


def test_argon2id_hashing():
    """Step 8 & 16: Verify Argon2id produces valid memory-hard hash and matches correctly."""
    pwd = "CorrectHorseBatteryStaple123!"
    hashed = hash_password(pwd)

    # Argon2id hashes start with $argon2id$
    assert hashed.startswith("$argon2id$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("wrong_password", hashed) is False


def test_jwt_tampering_rejected():
    """Step 10: Tampered JWT token signature is rejected with 401."""
    valid_token = create_access_token(subject=1, role="USER")

    # Tamper with the payload part of the JWT
    parts = valid_token.split(".")
    tampered_token = f"{parts[0]}.eyJhZG1pbiI6dHJ1ZX0.{parts[2]}"

    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
    assert resp.status_code == 401


def test_rate_limiting_trigger():
    """Step 17: Rapid requests exceed threshold and trigger HTTP 429."""
    # Reset history
    auth_rate_limiter.history.clear()
    responses = []
    for i in range(25):
        resp = client.post(
            "/auth/login",
            json={"email": f"brute_{i}@example.com", "password": "bad"},
        )
        responses.append(resp.status_code)

    # At least one of the latter attempts must be 429 Too Many Requests
    assert 429 in responses
    idx = responses.index(429)
    assert responses[idx] == 429
    auth_rate_limiter.history.clear()

