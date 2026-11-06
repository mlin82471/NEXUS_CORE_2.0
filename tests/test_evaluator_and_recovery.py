"""
Tests for Independent Evaluator & Task Crash Recovery.
Validates:
1. AST syntax inspection and failure detection on broken code.
2. Rejection of unhandled tracebacks and security violations.
3. Contract acceptance criteria checks (e.g. JSON schema structure).
4. Restart and crash recovery for interrupted tasks in 'running' state.
"""

import sqlite3
import pytest
from app.b0.protocols import SubTaskData, TaskData
from app.b1.evaluator import IndependentEvaluator
from app.b1.persistence import SQLitePersistence
from app.b1.budget import SQLiteBudgetTracker
from app.b1.events import SQLiteEventSystem
from app.b1.engine import ExecutionEngine


def test_independent_evaluator_empty_output():
    evaluator = IndependentEvaluator()
    subtask = SubTaskData(id="sub-1", task_id="t-1", step_key="s1", goal="Goal", role="analysis")
    
    res = evaluator.evaluate_subtask(subtask, "")
    assert res.status == "failed"
    assert "empty" in res.notes.lower()


def test_independent_evaluator_ast_syntax():
    evaluator = IndependentEvaluator()
    subtask = SubTaskData(id="sub-2", task_id="t-1", step_key="s2", goal="Write code", role="coding")

    # Invalid python code syntax
    bad_code = "```python\ndef broken(\n    return 42\n```"
    res_bad = evaluator.evaluate_subtask(subtask, bad_code)
    assert res_bad.status == "failed"
    assert "syntax" in res_bad.notes.lower()

    # Valid python code
    good_code = "```python\ndef valid():\n    return 42\n```"
    res_good = evaluator.evaluate_subtask(subtask, good_code)
    assert res_good.status == "passed"
    assert res_good.score == 1.0


def test_independent_evaluator_traceback_detection():
    evaluator = IndependentEvaluator()
    subtask = SubTaskData(id="sub-3", task_id="t-1", step_key="s3", goal="Compute", role="analysis")

    # Output containing an unhandled traceback
    error_output = "Execution started...\nTraceback (most recent call last):\n  File 'app.py', line 10\nZeroDivisionError: division by zero"
    res = evaluator.evaluate_subtask(subtask, error_output)
    assert res.status == "failed"
    assert "traceback" in res.notes.lower()


def test_independent_evaluator_json_criterion():
    evaluator = IndependentEvaluator()
    subtask = SubTaskData(
        id="sub-4",
        task_id="t-1",
        step_key="s4",
        goal="Parse info",
        role="analysis",
        acceptance_criteria=["Must output valid json"],
    )

    # Plain text without json
    res_fail = evaluator.evaluate_subtask(subtask, "Just some plain text without json")
    assert res_fail.status == "failed"
    assert "json" in res_fail.notes.lower()

    # Valid json enclosed in markdown
    res_pass = evaluator.evaluate_subtask(subtask, "```json\n{\"status\": \"ok\", \"count\": 5}\n```")
    assert res_pass.status == "passed"


def test_crash_recovery_pipeline(tmp_path):
    import os
    db_path = str(tmp_path / "recovery_test.db")
    ddl_path = os.path.join(os.path.dirname(__file__), "..", "docs", "B0_v7_init.sql")
    with sqlite3.connect(db_path) as conn, open(ddl_path, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
        conn.execute(
            """
            INSERT INTO agents (id, name, role, adapter_type, enabled, verification_status, capabilities, permission_set)
            VALUES ('agent-1', 'Agent 1', 'analysis', 'mock', 1, 'verified', '["read_data"]', '["read_data"]')
            """
        )
        conn.commit()

    p = SQLitePersistence(db_path)
    b = SQLiteBudgetTracker(db_path)
    e = SQLiteEventSystem(db_path)
    engine = ExecutionEngine(p, b, e)

    # 1. Create a task and transition it to 'running'
    task = engine.submit_task(goal="Task interrupted by power outage", allowed_permissions=["read_data"])
    p.update_task_status(task.id, "queued", "running")

    # 2. Create subtask in 'running' state
    subtask = SubTaskData(
        id="sub-crashed",
        task_id=task.id,
        step_key="s1",
        goal="Execute interrupted subtask",
        role="analysis",
        status="running",
    )
    p.create_subtask(subtask)

    # 3. Create a pending budget reservation
    res = b.reserve(task_id=task.id, tokens=5000, calls=1, caller_id="agent-1", subtask_id=subtask.id)

    # 4. Trigger recovery
    recovered = engine.recover_interrupted_tasks()
    assert task.id in recovered

    # 5. Verify subtask was marked failed
    updated_sub = p.get_subtask(subtask.id)
    assert updated_sub.status == "failed"

    # 6. Verify task status was deterministically aggregated per B0 v7
    updated_task = p.get_task(task.id)
    assert updated_task.status in ("failed", "partial")
