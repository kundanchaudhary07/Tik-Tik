from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token
from app.core.rate_limit import auth_rate_limiter
from app.models.activity import ActivityPriority, ActivityStatus, ActivityUrgency

client = TestClient(app)


def get_tokens():
    auth_rate_limiter.history.clear()
    token_a = create_access_token(subject="2", role="USER")
    token_b = create_access_token(subject="1", role="ADMIN")
    return token_a, token_b


def test_activity_crud_and_idor_protection():
    """Verify Activity CRUD and multi-tenant IDOR protection."""
    token_a, token_b = get_tokens()

    # User A creates an activity
    resp = client.post(
        "/api/activities",
        json={
            "title": "Prepare Q3 Financial Audit",
            "description": "Consolidate spreadsheets and balance sheets",
            "importance": 4,
            "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 201
    activity = resp.json()
    activity_id = activity["id"]
    assert activity["title"] == "Prepare Q3 Financial Audit"
    assert activity["importance"] == 4
    assert activity["status"] == "PENDING"
    assert activity["urgency"] == "DUE_SOON"  # 2 days <= 72 hours
    assert activity["priority_quadrant"] == "P1_CRITICAL"  # Importance 4 + DUE_SOON

    # User A can view activity
    get_a = client.get(f"/api/activities/{activity_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert get_a.status_code == 200

    # User B attempts to access User A's activity -> 404 Not Found (IDOR protected)
    get_b = client.get(f"/api/activities/{activity_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert get_b.status_code == 404

    # User B attempts to update User A's activity -> 404 Not Found
    put_b = client.patch(
        f"/api/activities/{activity_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert put_b.status_code == 404

    # User B attempts to delete User A's activity -> 404 Not Found
    del_b = client.delete(f"/api/activities/{activity_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert del_b.status_code == 404

    # Clean up User A's activity
    del_a = client.delete(f"/api/activities/{activity_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert del_a.status_code == 204


def test_urgency_and_priority_calculation():
    """Verify backend calculations of Urgency and Priority (Eisenhower Matrix)."""
    token_a, _ = get_tokens()
    now = datetime.now(timezone.utc)

    # 1. Overdue + Critical Importance (5) -> P1_CRITICAL
    resp1 = client.post(
        "/api/activities",
        json={
            "title": "Fix Critical Production Outage",
            "importance": 5,
            "deadline": (now - timedelta(hours=2)).isoformat(),
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act1 = resp1.json()
    assert act1["urgency"] == "OVERDUE"
    assert act1["priority_quadrant"] == "P1_CRITICAL"
    assert act1["priority_score"] >= 100

    # 2. Distant Deadline + Critical Importance (5) -> P2_HIGH (Strategic)
    resp2 = client.post(
        "/api/activities",
        json={
            "title": "Architect Phase 3 Microservices Strategy",
            "importance": 5,
            "deadline": (now + timedelta(days=30)).isoformat(),
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act2 = resp2.json()
    assert act2["urgency"] == "LOW"
    assert act2["priority_quadrant"] == "P2_HIGH"

    # 3. Due Today + Low Importance (2) -> P3_MEDIUM (Urgent but not strategic)
    resp3 = client.post(
        "/api/activities",
        json={
            "title": "Submit Weekly Standup Survey",
            "importance": 2,
            "deadline": (now + timedelta(hours=4)).isoformat(),
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act3 = resp3.json()
    assert act3["urgency"] == "DUE_TODAY"
    assert act3["priority_quadrant"] == "P3_MEDIUM"

    # 4. No Deadline + Low Importance (1) -> P4_LOW
    resp4 = client.post(
        "/api/activities",
        json={
            "title": "Organize Bookmark Folders",
            "importance": 1,
            "deadline": None,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act4 = resp4.json()
    assert act4["urgency"] == "NONE"
    assert act4["priority_quadrant"] == "P4_LOW"

    # Cleanup
    for act in [act1, act2, act3, act4]:
        client.delete(f"/api/activities/{act['id']}", headers={"Authorization": f"Bearer {token_a}"})


def test_subtasks_and_progress_calculation():
    """Verify subtasks creation, progress percentage, and ordering."""
    token_a, token_b = get_tokens()

    # Create parent activity
    resp = client.post(
        "/api/activities",
        json={"title": "Deploy API v2.0 Release", "importance": 4},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act_id = resp.json()["id"]

    # Add 4 subtasks
    subtasks = []
    for title in ["Run migrations", "Execute test suite", "Update DNS records", "Verify health probes"]:
        st_resp = client.post(
            f"/api/activities/{act_id}/subtasks",
            json={"title": title},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert st_resp.status_code == 201
        subtasks.append(st_resp.json())

    # User B cannot add subtasks to User A's activity
    b_st = client.post(
        f"/api/activities/{act_id}/subtasks",
        json={"title": "Malicious Subtask"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert b_st.status_code == 404

    # Check progress is initially 0.0%
    act_state = client.get(f"/api/activities/{act_id}", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert act_state["progress_percentage"] == 0.0
    assert act_state["total_subtasks"] == 4
    assert act_state["completed_subtasks"] == 0

    # Complete 2 of 4 subtasks -> progress = 50.0%
    client.patch(
        f"/api/subtasks/{subtasks[0]['id']}",
        json={"is_completed": True},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    client.patch(
        f"/api/subtasks/{subtasks[1]['id']}",
        json={"is_completed": True},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    act_state2 = client.get(f"/api/activities/{act_id}", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert act_state2["progress_percentage"] == 50.0
    assert act_state2["completed_subtasks"] == 2

    # User B cannot toggle User A's subtask
    b_toggle = client.patch(
        f"/api/subtasks/{subtasks[2]['id']}",
        json={"is_completed": True},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert b_toggle.status_code == 404

    # Cleanup
    client.delete(f"/api/activities/{act_id}", headers={"Authorization": f"Bearer {token_a}"})


def test_completion_rules_enforcement():
    """
    Verify completion rule:
    Cannot mark activity COMPLETED when subtasks are open, unless force_complete=True.
    """
    token_a, _ = get_tokens()

    # Create activity with 2 open subtasks
    resp = client.post(
        "/api/activities",
        json={"title": "Client Contract Signoff", "importance": 4},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act_id = resp.json()["id"]
    client.post(f"/api/activities/{act_id}/subtasks", json={"title": "Legal review"}, headers={"Authorization": f"Bearer {token_a}"})
    client.post(f"/api/activities/{act_id}/subtasks", json={"title": "Security audit"}, headers={"Authorization": f"Bearer {token_a}"})

    # Attempting to mark activity COMPLETED without force_complete -> 400 Bad Request
    fail_resp = client.patch(
        f"/api/activities/{act_id}",
        json={"status": "COMPLETED", "force_complete": False},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert fail_resp.status_code == 400
    assert fail_resp.json()["error"]["code"] == "INCOMPLETE_SUBTASKS"

    # Completing with force_complete=True -> succeeds and finishes all open subtasks
    success_resp = client.patch(
        f"/api/activities/{act_id}",
        json={"status": "COMPLETED", "force_complete": True},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert success_resp.status_code == 200
    updated_act = success_resp.json()
    assert updated_act["status"] == "COMPLETED"
    assert updated_act["completed_at"] is not None
    assert updated_act["progress_percentage"] == 100.0
    assert updated_act["completed_subtasks"] == 2

    # Reopening activity clears completed_at
    reopen_resp = client.patch(
        f"/api/activities/{act_id}",
        json={"status": "IN_PROGRESS"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["completed_at"] is None

    # Cleanup
    client.delete(f"/api/activities/{act_id}", headers={"Authorization": f"Bearer {token_a}"})


def test_reminders_lifecycle_and_snooze():
    """Verify Reminders creation, evaluation, snoozing, and dismissal."""
    token_a, token_b = get_tokens()
    now = datetime.now(timezone.utc)

    # Create activity
    act_resp = client.post(
        "/api/activities",
        json={"title": "Submit Tax Documentation", "importance": 5},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act_id = act_resp.json()["id"]

    # Create reminder in the past -> should evaluate to DUE
    past_time = (now - timedelta(minutes=5)).isoformat()
    r_resp = client.post(
        f"/api/activities/{act_id}/reminders",
        json={"remind_at": past_time, "message": "Remember to attach W-2"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r_resp.status_code == 201
    reminder = r_resp.json()
    r_id = reminder["id"]
    assert reminder["effective_status"] == "DUE"

    # User B cannot snooze User A's reminder
    b_snooze = client.post(f"/api/reminders/{r_id}/snooze", json={"minutes": 30}, headers={"Authorization": f"Bearer {token_b}"})
    assert b_snooze.status_code == 404

    # User A snoozes reminder by 30 minutes
    snooze_resp = client.post(f"/api/reminders/{r_id}/snooze", json={"minutes": 30}, headers={"Authorization": f"Bearer {token_a}"})
    assert snooze_resp.status_code == 200
    assert snooze_resp.json()["status"] == "SNOOZED"
    assert snooze_resp.json()["effective_status"] == "SNOOZED"
    assert snooze_resp.json()["snooze_until"] is not None

    # User A dismisses reminder
    dismiss_resp = client.post(f"/api/reminders/{r_id}/dismiss", headers={"Authorization": f"Bearer {token_a}"})
    assert dismiss_resp.status_code == 200
    assert dismiss_resp.json()["status"] == "DISMISSED"
    assert dismiss_resp.json()["effective_status"] == "DISMISSED"

    # Cleanup
    client.delete(f"/api/activities/{act_id}", headers={"Authorization": f"Bearer {token_a}"})


def test_followups_lifecycle():
    """Verify follow-up scheduling, updating, and completion."""
    token_a, token_b = get_tokens()
    now = datetime.now(timezone.utc)

    # Create activity
    act_resp = client.post(
        "/api/activities",
        json={"title": "Client Project Kickoff", "importance": 4},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    act_id = act_resp.json()["id"]

    # Schedule follow-up
    sched_time = (now + timedelta(days=3)).isoformat()
    fu_resp = client.post(
        f"/api/activities/{act_id}/followups",
        json={"note": "Check in with client on scope signoff", "scheduled_at": sched_time},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert fu_resp.status_code == 201
    followup = fu_resp.json()
    fu_id = followup["id"]
    assert followup["status"] == "PENDING"

    # User B cannot access User A's follow-up
    b_patch = client.patch(
        f"/api/followups/{fu_id}",
        json={"status": "COMPLETED"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert b_patch.status_code == 404

    # User A completes follow-up with outcome note
    comp_resp = client.patch(
        f"/api/followups/{fu_id}",
        json={"status": "COMPLETED", "outcome": "Client approved final sprint scope in full."},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "COMPLETED"
    assert comp_resp.json()["completed_at"] is not None
    assert "Client approved" in comp_resp.json()["outcome"]

    # Cleanup
    client.delete(f"/api/activities/{act_id}", headers={"Authorization": f"Bearer {token_a}"})


def test_activity_summary_statistics():
    """Verify aggregate summary statistics endpoint."""
    token_a, _ = get_tokens()

    # Query summary
    summary_resp = client.get("/api/activities/summary", headers={"Authorization": f"Bearer {token_a}"})
    assert summary_resp.status_code == 200
    data = summary_resp.json()
    assert "total_activities" in data
    assert "pending" in data
    assert "in_progress" in data
    assert "completed" in data
    assert "overdue" in data
    assert "due_today" in data
    assert "due_soon" in data
    assert "high_priority_p1" in data
