"""
B1 Persistence Implementation backed by SQLite WAL database.
Strictly implements B0.PersistenceProtocol (§10.5).
"""
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from app.b0.protocols import (
    AgentData,
    AgentRunData,
    PersistenceProtocol,
    SubTaskData,
    TaskData,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLitePersistence(PersistenceProtocol):
    """
    Persistence adapter for SQLite.
    All write operations are executed here. No other B1 component accesses SQL directly.
    """

    def __init__(self, db_path: str):
        self.db_path = db_path

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    # -----------------------------------------------------------------------
    # Task Operations
    # -----------------------------------------------------------------------

    def create_task(self, task: TaskData) -> TaskData:
        now_str = task.created_at or _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO tasks (
                    id, goal, status, risk_suggestion, risk_level, approval_status,
                    replan_count, verifier_result, closed_at, idempotency_key,
                    max_total_tokens, max_model_calls, max_steps, max_agents,
                    max_parallel, max_replans, subtask_token_limit, subtask_retry_limit,
                    allowed_permissions, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task.id,
                    task.goal,
                    task.status,
                    task.risk_suggestion,
                    task.risk_level,
                    task.approval_status,
                    task.replan_count,
                    json.dumps(task.verifier_result) if task.verifier_result else None,
                    task.closed_at,
                    task.idempotency_key,
                    task.max_total_tokens,
                    task.max_model_calls,
                    task.max_steps,
                    task.max_agents,
                    task.max_parallel,
                    task.max_replans,
                    task.subtask_token_limit,
                    task.subtask_retry_limit,
                    json.dumps(task.allowed_permissions or []),
                    now_str,
                    task.updated_at,
                ),
            )
            task.created_at = now_str
            return task

    def update_task_status(self, task_id: str, old_status: str, new_status: str) -> TaskData:
        now_str = _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                """
                UPDATE tasks
                SET status = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (new_status, now_str, task_id, old_status),
            )
            if cur.rowcount == 0:
                raise ValueError(
                    f"State conflict or task not found: task_id={task_id}, expected old_status={old_status}"
                )
        task = self.get_task(task_id)
        if not task:
            raise RuntimeError(f"Task not found immediately after update: {task_id}")
        return task

    def get_task(self, task_id: str) -> TaskData | None:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if not row:
                return None
            return self._row_to_task(row)

    def get_task_by_idempotency_key(self, key: str) -> TaskData | None:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE idempotency_key = ?", (key,)).fetchone()
            if not row:
                return None
            return self._row_to_task(row)

    def get_tasks_by_status(self, status: str) -> list[TaskData]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM tasks WHERE status = ?", (status,)).fetchall()
            return [self._row_to_task(r) for r in rows]

    def _row_to_task(self, row: sqlite3.Row) -> TaskData:
        return TaskData(
            id=row["id"],
            goal=row["goal"],
            status=row["status"],
            risk_suggestion=row["risk_suggestion"],
            risk_level=row["risk_level"],
            approval_status=row["approval_status"],
            replan_count=row["replan_count"],
            verifier_result=json.loads(row["verifier_result"]) if row["verifier_result"] else None,
            closed_at=row["closed_at"],
            idempotency_key=row["idempotency_key"],
            max_total_tokens=row["max_total_tokens"],
            max_model_calls=row["max_model_calls"],
            max_steps=row["max_steps"],
            max_agents=row["max_agents"],
            max_parallel=row["max_parallel"],
            max_replans=row["max_replans"],
            subtask_token_limit=row["subtask_token_limit"],
            subtask_retry_limit=row["subtask_retry_limit"],
            allowed_permissions=json.loads(row["allowed_permissions"]) if row["allowed_permissions"] else [],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # -----------------------------------------------------------------------
    # SubTask Operations
    # -----------------------------------------------------------------------

    def create_subtask(self, subtask: SubTaskData) -> SubTaskData:
        now_str = subtask.created_at or _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO subtasks (
                    id, task_id, step_key, plan_version, is_active, legacy_planstep_id,
                    parent_step_key, goal, role, required_permissions, acceptance_criteria,
                    depends_on, context, max_retries, token_limit, status,
                    assigned_agent_id, result_summary, result_structured, artifacts,
                    verification_status, verification_notes, execution_error,
                    token_input, token_output, token_usage_source, attempt_count,
                    execution_id, request_fingerprint, step_order, created_at,
                    started_at, finished_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    subtask.id,
                    subtask.task_id,
                    subtask.step_key,
                    subtask.plan_version,
                    subtask.is_active,
                    subtask.legacy_planstep_id,
                    subtask.parent_step_key,
                    subtask.goal,
                    subtask.role,
                    json.dumps(subtask.required_permissions or []),
                    json.dumps(subtask.acceptance_criteria or []),
                    json.dumps(subtask.depends_on or []),
                    json.dumps(subtask.context or {}),
                    subtask.max_retries,
                    subtask.token_limit,
                    subtask.status,
                    subtask.assigned_agent_id,
                    subtask.result_summary,
                    json.dumps(subtask.result_structured) if subtask.result_structured else None,
                    json.dumps(subtask.artifacts) if subtask.artifacts else None,
                    subtask.verification_status,
                    subtask.verification_notes,
                    subtask.execution_error,
                    subtask.token_input,
                    subtask.token_output,
                    subtask.token_usage_source,
                    subtask.attempt_count,
                    subtask.execution_id,
                    subtask.request_fingerprint,
                    subtask.step_order,
                    now_str,
                    subtask.started_at,
                    subtask.finished_at,
                ),
            )
            subtask.created_at = now_str
            return subtask

    def update_subtask_status(
        self, subtask_id: str, old_status: str, new_status: str, execution_error: str | None = None
    ) -> SubTaskData:
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                """
                UPDATE subtasks
                SET status = ?, execution_error = coalesce(?, execution_error)
                WHERE id = ? AND status = ?
                """,
                (new_status, execution_error, subtask_id, old_status),
            )
            if cur.rowcount == 0:
                raise ValueError(
                    f"SubTask conflict: id={subtask_id}, expected old_status={old_status}"
                )
        st = self.get_subtask(subtask_id)
        if not st:
            raise RuntimeError(f"Subtask not found immediately after update: {subtask_id}")
        return st

    def update_subtask_execution(
        self, subtask_id: str, execution_id: str, attempt_count: int, started_at: str
    ) -> SubTaskData:
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                UPDATE subtasks
                SET execution_id = ?, attempt_count = ?, started_at = ?
                WHERE id = ?
                """,
                (execution_id, attempt_count, started_at, subtask_id),
            )
        st = self.get_subtask(subtask_id)
        if not st:
            raise RuntimeError(f"Subtask not found: {subtask_id}")
        return st

    def record_subtask_result(
        self,
        subtask_id: str,
        result_summary: str | None,
        result_structured: dict | None,
        artifacts: list | None,
        token_input: int,
        token_output: int,
        token_usage_source: str,
        finished_at: str,
    ) -> SubTaskData:
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                UPDATE subtasks
                SET result_summary = ?,
                    result_structured = ?,
                    artifacts = ?,
                    token_input = ?,
                    token_output = ?,
                    token_usage_source = ?,
                    finished_at = ?
                WHERE id = ?
                """,
                (
                    result_summary,
                    json.dumps(result_structured) if result_structured else None,
                    json.dumps(artifacts) if artifacts else None,
                    token_input,
                    token_output,
                    token_usage_source,
                    finished_at,
                    subtask_id,
                ),
            )
        st = self.get_subtask(subtask_id)
        if not st:
            raise RuntimeError(f"Subtask not found: {subtask_id}")
        return st

    def record_subtask_verification(
        self, subtask_id: str, verification_status: str, verification_notes: str | None
    ) -> SubTaskData:
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                UPDATE subtasks
                SET verification_status = ?, verification_notes = ?
                WHERE id = ?
                """,
                (verification_status, verification_notes, subtask_id),
            )
        st = self.get_subtask(subtask_id)
        if not st:
            raise RuntimeError(f"Subtask not found: {subtask_id}")
        return st

    def supersede_subtasks(self, task_id: str, plan_version: int) -> int:
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                """
                UPDATE subtasks
                SET is_active = 0, status = 'superseded'
                WHERE task_id = ? AND plan_version = ? AND is_active = 1
                """,
                (task_id, plan_version),
            )
            return cur.rowcount

    def get_subtask(self, subtask_id: str) -> SubTaskData | None:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM subtasks WHERE id = ?", (subtask_id,)).fetchone()
            if not row:
                return None
            return self._row_to_subtask(row)

    def get_active_subtasks(self, task_id: str) -> list[SubTaskData]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM subtasks WHERE task_id = ? AND is_active = 1 ORDER BY step_order, created_at",
                (task_id,),
            ).fetchall()
            return [self._row_to_subtask(r) for r in rows]

    def _row_to_subtask(self, row: sqlite3.Row) -> SubTaskData:
        return SubTaskData(
            id=row["id"],
            task_id=row["task_id"],
            step_key=row["step_key"],
            plan_version=row["plan_version"],
            is_active=row["is_active"],
            legacy_planstep_id=row["legacy_planstep_id"],
            parent_step_key=row["parent_step_key"],
            goal=row["goal"],
            role=row["role"],
            required_permissions=json.loads(row["required_permissions"]) if row["required_permissions"] else [],
            acceptance_criteria=json.loads(row["acceptance_criteria"]) if row["acceptance_criteria"] else [],
            depends_on=json.loads(row["depends_on"]) if row["depends_on"] else [],
            context=json.loads(row["context"]) if row["context"] else {},
            max_retries=row["max_retries"],
            token_limit=row["token_limit"],
            status=row["status"],
            assigned_agent_id=row["assigned_agent_id"],
            result_summary=row["result_summary"],
            result_structured=json.loads(row["result_structured"]) if row["result_structured"] else None,
            artifacts=json.loads(row["artifacts"]) if row["artifacts"] else None,
            verification_status=row["verification_status"],
            verification_notes=row["verification_notes"],
            execution_error=row["execution_error"],
            token_input=row["token_input"],
            token_output=row["token_output"],
            token_usage_source=row["token_usage_source"],
            attempt_count=row["attempt_count"],
            execution_id=row["execution_id"],
            request_fingerprint=row["request_fingerprint"],
            step_order=row["step_order"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
        )

    # -----------------------------------------------------------------------
    # Agent & AgentRun Operations
    # -----------------------------------------------------------------------

    def create_agent_run(self, agent_run: AgentRunData) -> AgentRunData:
        now_str = agent_run.created_at or _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO agent_runs (
                    id, task_id, agent_id, subtask_id, execution_id,
                    request_fingerprint, status, result, input_tokens,
                    output_tokens, usage_source, confidence, verification_passed,
                    created_at, finished_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agent_run.id,
                    agent_run.task_id,
                    agent_run.agent_id,
                    agent_run.subtask_id,
                    agent_run.execution_id,
                    agent_run.request_fingerprint,
                    agent_run.status,
                    agent_run.result,
                    agent_run.input_tokens,
                    agent_run.output_tokens,
                    agent_run.usage_source,
                    agent_run.confidence,
                    agent_run.verification_passed,
                    now_str,
                    agent_run.finished_at,
                ),
            )
            agent_run.created_at = now_str
            return agent_run

    def get_agent_run_by_execution_id(self, execution_id: str) -> AgentRunData | None:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM agent_runs WHERE execution_id = ?", (execution_id,)
            ).fetchone()
            if not row:
                return None
            return AgentRunData(
                id=row["id"],
                task_id=row["task_id"],
                agent_id=row["agent_id"],
                subtask_id=row["subtask_id"],
                execution_id=row["execution_id"],
                request_fingerprint=row["request_fingerprint"],
                status=row["status"],
                result=row["result"],
                input_tokens=row["input_tokens"],
                output_tokens=row["output_tokens"],
                usage_source=row["usage_source"],
                confidence=row["confidence"],
                verification_passed=row["verification_passed"],
                created_at=row["created_at"],
                finished_at=row["finished_at"],
            )

    def get_agent(self, agent_id: str) -> AgentData | None:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
            if not row:
                return None
            return self._row_to_agent(row)

    def list_agents(self, role: str | None = None, enabled_only: bool = True) -> list[AgentData]:
        with self._get_conn() as conn:
            query = "SELECT * FROM agents WHERE 1=1"
            params = []
            if role:
                query += " AND role = ?"
                params.append(role)
            if enabled_only:
                query += " AND enabled = 1"
            query += " ORDER BY id"
            rows = conn.execute(query, tuple(params)).fetchall()
            return [self._row_to_agent(r) for r in rows]

    def _row_to_agent(self, row: sqlite3.Row) -> AgentData:
        return AgentData(
            id=row["id"],
            name=row["name"],
            role=row["role"],
            adapter_type=row["adapter_type"],
            enabled=bool(row["enabled"]),
            capabilities=json.loads(row["capabilities"]) if row["capabilities"] else [],
            permission_set=json.loads(row["permission_set"]) if row["permission_set"] else [],
            verification_status=row["verification_status"],
            verified_at=row["verified_at"],
            created_at=row["created_at"],
        )
