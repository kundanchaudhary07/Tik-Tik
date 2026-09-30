import time
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_tokens():
    # Login as User A
    resp_a = client.post("/auth/login", json={"email": "user@example.com", "password": "UserPassword123!"})
    token_a = resp_a.json()["access_token"]

    # Login as Admin (User B)
    resp_b = client.post("/auth/login", json={"email": "admin@example.com", "password": "AdminPassword123!"})
    token_b = resp_b.json()["access_token"]

    return token_a, token_b


def test_crud_and_idor_protection():
    """Step 2 & Step 12: CRUD operations and IDOR protection."""
    token_a, token_b = get_tokens()

    # User A creates an item
    create_resp = client.post(
        "/api/demo",
        json={"title": "User A Secret Item", "description": "Confidential data"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert create_resp.status_code == 201
    item = create_resp.json()
    item_id = item["id"]

    # User A can access it
    get_resp_a = client.get(f"/api/demo/{item_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert get_resp_a.status_code == 200
    assert get_resp_a.json()["title"] == "User A Secret Item"

    # User B (different user) attempts to access User A's item -> IDOR PROTECTED (403)
    get_resp_b = client.get(f"/api/demo/{item_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert get_resp_b.status_code == 403
    assert "IDOR" in get_resp_b.json()["error"]["code"]

    # User B attempts to delete User A's item -> IDOR PROTECTED (403)
    del_resp_b = client.delete(f"/api/demo/{item_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert del_resp_b.status_code == 403

    # User A deletes their own item -> 200
    del_resp_a = client.delete(f"/api/demo/{item_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert del_resp_a.status_code == 200

    # Getting deleted item returns 404
    get_404 = client.get(f"/api/demo/{item_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert get_404.status_code == 404


def test_transaction_rollback_demonstration():
    """Step 7: Transaction atomicity and rollback on failure."""
    token_a, _ = get_tokens()

    # Run transaction test with intentional failure on Op B
    resp = client.post(
        "/api/demo/transactions/test",
        json={"fail_second_operation": True, "title_a": "Atomic Item A", "title_b": "Atomic Item B"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rolled_back"
    assert data["operation_a_rolled_back"] is True
    assert "Atomicity preserved" in data["acid_guarantee"]


def test_idempotency_key_replay():
    """Step 18: Idempotency-Key prevents duplicate execution."""
    token_a, _ = get_tokens()
    unique_key = f"key-{time.time()}"

    # First request
    resp1 = client.post(
        "/api/demo",
        json={"title": "Idempotent Item", "description": "Should only be created once"},
        headers={"Authorization": f"Bearer {token_a}", "Idempotency-Key": unique_key},
    )
    assert resp1.status_code == 201
    item1 = resp1.json()

    # Second request with exact same Idempotency-Key
    resp2 = client.post(
        "/api/demo",
        json={"title": "Idempotent Item", "description": "Should only be created once"},
        headers={"Authorization": f"Bearer {token_a}", "Idempotency-Key": unique_key},
    )
    assert resp2.status_code == 201
    assert resp2.headers.get("X-Idempotency-Replayed") == "true"
    item2 = resp2.json()
    # Confirms it is the exact same created item ID
    assert item1["id"] == item2["id"]


def test_concurrency_row_locking():
    """Step 19: Concurrency with PostgreSQL row-level lock (with_for_update)."""
    token_a, _ = get_tokens()

    # Create item
    create_resp = client.post(
        "/api/demo",
        json={"title": "Counter Item", "description": "Locking demo"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    item_id = create_resp.json()["id"]

    # Increment using pessimistic locking
    inc_resp = client.post(
        f"/api/demo/{item_id}/increment",
        json={"strategy": "pessimistic"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert inc_resp.status_code == 200
    assert inc_resp.json()["strategy"] == "pessimistic_row_lock"
    assert inc_resp.json()["counter"] == 1
