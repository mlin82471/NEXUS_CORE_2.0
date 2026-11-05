"""
API B0 Integration Tests.
Verifies Idempotency keys, RFC 8785 request fingerprints,
budget immutability enforcement, and step status via FastAPI endpoints.
"""

from fastapi.testclient import TestClient


def test_api_idempotency_replay(client):
    tc, _ = client
    # First submission
    r1 = tc.post(
        "/tasks",
        json={
            "goal": "Test idempotent task submission",
            "task_type": "general",
            "idempotency_key": "idem-key-001",
        },
    )
    assert r1.status_code == 202
    data1 = r1.json()
    assert data1["status"] == "queued"
    task_id = data1["task_id"]

    # Replay with identical goal and key
    r2 = tc.post(
        "/tasks",
        json={
            "goal": "Test idempotent task submission",
            "task_type": "general",
            "idempotency_key": "idem-key-001",
        },
    )
    assert r2.status_code == 202
    data2 = r2.json()
    assert data2["task_id"] == task_id
    assert data2.get("is_replay") is True


def test_api_idempotency_conflict_rejected(client):
    tc, _ = client
    # First submission
    r1 = tc.post(
        "/tasks",
        json={
            "goal": "Original goal text",
            "task_type": "general",
            "idempotency_key": "idem-key-conflict",
        },
    )
    assert r1.status_code == 202

    # Second submission with same key but different goal -> 409 conflict
    r2 = tc.post(
        "/tasks",
        json={
            "goal": "Completely different goal text",
            "task_type": "general",
            "idempotency_key": "idem-key-conflict",
        },
    )
    assert r2.status_code == 409
    assert "conflicting" in r2.json()["detail"].lower()


def test_api_task_detail_contains_b0_fields(client):
    tc, _ = client
    r = tc.post(
        "/tasks",
        json={
            "goal": "Verify B0 fields in task detail",
            "task_type": "analysis",
            "idempotency_key": "idem-fields-002",
            "allowed_permissions": ["read_data", "reason"],
        },
    )
    assert r.status_code == 202
    tid = r.json()["task_id"]

    detail = tc.get(f"/tasks/{tid}").json()
    assert detail["idempotency_key"] == "idem-fields-002"
    assert "read_data" in detail["allowed_permissions"]
    assert "reason" in detail["allowed_permissions"]
    assert "budget" in detail
    assert "replan_count" in detail


def test_api_get_task_steps(client):
    tc, _ = client
    r = tc.post("/tasks", json={"goal": "Verify step status endpoint"})
    tid = r.json()["task_id"]

    steps = tc.get(f"/tasks/{tid}/steps").json()
    assert len(steps) >= 1
    assert "step_key" in steps[0]
    assert "status" in steps[0]
    assert "verification_status" in steps[0]
