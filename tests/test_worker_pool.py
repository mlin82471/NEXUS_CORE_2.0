"""
Tests for Background Worker Pool, Async Execution, and Server-Sent Events (SSE) Streaming.
"""
import time
import pytest
from app.models import Task, PlanStep
from app.services.worker_pool import submit_task_execution, cancel_task

def test_async_task_execution_api(client):
    tc, Session = client

    # Create task
    r_create = tc.post("/tasks", json={
        "goal": "测试异步后台工作池执行流程",
        "task_type": "general",
        "risk_suggestion": "low"
    })
    assert r_create.status_code == 202
    task_id = r_create.json()["task_id"]

    # Execute async
    r_exec = tc.post(f"/tasks/{task_id}/execute_async")
    assert r_exec.status_code == 202
    data = r_exec.json()
    assert data["task_id"] == task_id
    assert data["status"] == "running"
    assert "stream_url" in data

    # Wait for background thread to complete
    max_wait = 10
    start = time.time()
    db = Session()
    try:
        final_status = None
        while time.time() - start < max_wait:
            time.sleep(0.2)
            task = db.get(Task, task_id)
            if task and task.status in ("success", "partial", "failed"):
                final_status = task.status
                break
        assert final_status in ("success", "partial")
    finally:
        db.close()


def test_task_cancellation_api(client):
    tc, Session = client

    # Create task
    r_create = tc.post("/tasks", json={
        "goal": "测试任务取消中断能力",
        "task_type": "coding",
        "risk_suggestion": "low"
    })
    assert r_create.status_code == 202
    task_id = r_create.json()["task_id"]

    # Cancel task
    r_cancel = tc.post(f"/tasks/{task_id}/cancel")
    assert r_cancel.status_code == 200
    assert r_cancel.json()["cancelled"] is True

    # Verify status in DB
    db = Session()
    try:
        task = db.get(Task, task_id)
        assert task is not None
        assert task.status == "cancelled"
    finally:
        db.close()


def test_sse_stream_historical_events(client):
    tc, Session = client

    # Create and synchronously execute a simple task
    r_create = tc.post("/tasks", json={
        "goal": "测试历史 SSE 事件回放",
        "task_type": "general",
        "risk_suggestion": "low"
    })
    task_id = r_create.json()["task_id"]

    tc.post(f"/tasks/{task_id}/execute", headers={"Content-Type": "application/json"}, json={})

    # Now read SSE stream
    with tc.stream("GET", f"/tasks/{task_id}/stream") as res:
        assert res.status_code == 200
        assert "text/event-stream" in res.headers.get("content-type", "")
        # Read lines
        lines = [line for line in res.iter_lines() if line]
        joined = "\n".join(lines)
        assert "event: task_created" in joined or "event: task_finished" in joined
