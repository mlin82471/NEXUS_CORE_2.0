"""
B1 Unified Execution Engine tests (§B1).
Verifies submit_task, plan_and_initialize_subtasks, execute_task,
and task status aggregation using B0 v7 contract.
"""

import os
import sqlite3
import tempfile
import pytest

from app.b0.protocols import SubTaskData, TaskData
from app.b1.persistence import SQLitePersistence
from app.b1.budget import SQLiteBudgetTracker
from app.b1.events import SQLiteEventSystem
from app.b1.engine import ExecutionEngine
from app.config import settings


@pytest.fixture
def b1_env(tmp_path):
    db_path = str(tmp_path / "b1_test.db")
    ddl_path = os.path.join(
        os.path.dirname(__file__), "..", "docs", "B0_v7_init.sql"
    )
    with sqlite3.connect(db_path) as conn, open(ddl_path, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
        # Seed test agents into B0 v7 agents table
        conn.execute(
            """
            INSERT INTO agents (id, name, role, adapter_type, enabled, verification_status, capabilities, permission_set)
            VALUES 
                ('mock-analysis', 'Mock Analysis', 'analysis', 'mock', 1, 'verified', '["read_data","reason"]', '["read_data","reason"]'),
                ('mock-coding', 'Mock Coding', 'coding', 'mock', 1, 'verified', '["read_files","write_files","execute_code"]', '["read_files","write_files","execute_code"]')
            """
        )
        conn.commit()

    p = SQLitePersistence(db_path)
    b = SQLiteBudgetTracker(db_path)
    e = SQLiteEventSystem(db_path)
    engine = ExecutionEngine(p, b, e)
    return engine, p, b, e


def test_b1_engine_task_lifecycle(b1_env):
    engine, p, b, e = b1_env

    # 1. Submit task
    task = engine.submit_task(
        goal="Analyze system logs",
        allowed_permissions=["read_data", "reason"],
        max_total_tokens=100000,
    )
    assert task.status == "queued"
    assert task.id is not None

    # 2. Plan subtasks
    subtasks = engine.plan_and_initialize_subtasks(
        task.id,
        [
            {
                "step_key": "s1",
                "goal": "Scan logs for anomalies",
                "role": "analysis",
                "depends_on": [],
            }
        ],
    )
    assert len(subtasks) == 1
    assert subtasks[0].step_key == "s1"
    assert subtasks[0].status == "pending"

    # 3. Execute task
    completed = engine.execute_task(task.id)
    assert completed.status == "success"

    # 4. Verify task state in persistence
    persisted = p.get_task(task.id)
    assert persisted.status == "success"

    # 5. Verify events recorded
    events = e.get_events_for_task(task.id)
    event_types = [ev.event_type for ev in events]
    assert "task_created" in event_types
    assert "task_started" in event_types
    assert "task_success" in event_types


def test_b1_engine_idempotency(b1_env):
    engine, p, b, e = b1_env

    t1 = engine.submit_task(
        goal="Idempotent task",
        idempotency_key="unique-key-123",
        allowed_permissions=["read_data"],
    )
    # Submitting again with identical key returns same task
    t2 = engine.submit_task(
        goal="Idempotent task",
        idempotency_key="unique-key-123",
        allowed_permissions=["read_data"],
    )
    assert t1.id == t2.id
