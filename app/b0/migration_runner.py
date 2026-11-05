"""
NEXUS CORE 2.0 — B0 Database Migration Runner (§7)
Provides atomic, asserted migrations for Fresh Init, M0-A, v1, and v2 -> v3.
"""
import os
import sqlite3
from typing import Any

class MigrationError(Exception):
    """Raised when migration pre-check, execution, or post-check assertion fails."""
    pass

class MigrationRunner:
    def __init__(self, db_path: str, docs_dir: str | None = None):
        self.db_path = db_path
        self.docs_dir = docs_dir or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "docs")

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def detect_version(self, conn: sqlite3.Connection) -> str:
        """Detect database schema origin per §7.1.
        Returns 'empty', 'm0a', '1', '2', '3', or invalid version string.
        """
        has_meta = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_nexus_meta'"
        ).fetchone()[0] > 0

        has_tasks = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tasks'"
        ).fetchone()[0] > 0

        if not has_meta and not has_tasks:
            return "empty"
        
        if not has_meta and has_tasks:
            return "m0a"

        row = conn.execute("SELECT value FROM _nexus_meta WHERE key='schema_version'").fetchone()
        if not row:
            raise MigrationError("Corrupted _nexus_meta: schema_version key is missing")
        return str(row[0])

    def migrate(self, fail_at_step: str | None = None) -> str:
        """Execute appropriate migration path to reach v3.
        Raises MigrationError if pre-checks, execution, or post-checks fail.
        Rolls back atomically on any failure.
        """
        conn = self._get_connection()
        try:
            version = self.detect_version(conn)
            if version == "3":
                return "v3_current"
            
            if version in ("empty", "m0a", "1", "2"):
                self._run_migration(conn, version, fail_at_step=fail_at_step)
                return f"migrated_from_{version}_to_v3"
            
            raise MigrationError(f"Unsupported schema version: {version!r}. Refusing startup.")
        finally:
            conn.close()

    def _get_table_columns(self, conn: sqlite3.Connection, table_name: str) -> set[str]:
        rows = conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()
        return {r[1] for r in rows}

    def _add_column_if_missing(self, conn: sqlite3.Connection, table: str, col_name: str, col_def: str) -> bool:
        cols = self._get_table_columns(conn, table)
        if col_name not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")
            return True
        return False

    def _run_migration(self, conn: sqlite3.Connection, source_version: str, fail_at_step: str | None = None) -> None:
        """Run single atomic migration with strict pre and post checks."""
        # 1. PRE-CHECKS
        if source_version == "m0a":
            has_plan_steps = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='plan_steps'"
            ).fetchone()[0] > 0
            if not has_plan_steps:
                raise MigrationError("M0-A pre-check failed: plan_steps table does not exist")
            
            dup = conn.execute(
                "SELECT task_id, step_key, COUNT(*) FROM plan_steps GROUP BY task_id, step_key HAVING COUNT(*) > 1"
            ).fetchall()
            if dup:
                raise MigrationError(f"M0-A pre-check failed: duplicate step_keys found: {dup}")

        elif source_version == "1":
            v = conn.execute("SELECT value FROM _nexus_meta WHERE key='schema_version'").fetchone()[0]
            if str(v) != "1":
                raise MigrationError(f"v1 pre-check failed: expected version 1, got {v}")

        elif source_version == "2":
            v = conn.execute("SELECT value FROM _nexus_meta WHERE key='schema_version'").fetchone()[0]
            if str(v) != "2":
                raise MigrationError(f"v2 pre-check failed: expected version 2, got {v}")
            has_subtasks = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='subtasks'"
            ).fetchone()[0] > 0
            if not has_subtasks:
                raise MigrationError("v2 pre-check failed: subtasks table does not exist")

        # 2. EXECUTE MIGRATION WITHIN ATOMIC TRANSACTION
        conn.execute("BEGIN IMMEDIATE")
        try:
            if source_version == "empty":
                init_sql = open(os.path.join(self.docs_dir, "B0_v7_init.sql"), encoding="utf-8").read()
                # Run the DDL statements (strip BEGIN/COMMIT from script since we manage transaction)
                clean_sql = init_sql.replace("BEGIN TRANSACTION;", "").replace("COMMIT;", "")
                conn.executescript(clean_sql)

            elif source_version in ("m0a", "1"):
                # Common migration for M0-A and v1
                conn.execute("CREATE TABLE IF NOT EXISTS _nexus_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

                # Add missing task columns safely without relying on exceptions
                self._add_column_if_missing(conn, "tasks", "approval_status", "TEXT NOT NULL DEFAULT 'none'")
                self._add_column_if_missing(conn, "tasks", "replan_count", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "tasks", "verifier_result", "JSON")
                self._add_column_if_missing(conn, "tasks", "closed_at", "TEXT")
                self._add_column_if_missing(conn, "tasks", "idempotency_key", "TEXT")
                self._add_column_if_missing(conn, "tasks", "max_total_tokens", "INTEGER NOT NULL DEFAULT 200000")
                self._add_column_if_missing(conn, "tasks", "max_model_calls", "INTEGER NOT NULL DEFAULT 20")
                self._add_column_if_missing(conn, "tasks", "max_steps", "INTEGER NOT NULL DEFAULT 10")
                self._add_column_if_missing(conn, "tasks", "max_agents", "INTEGER NOT NULL DEFAULT 5")
                self._add_column_if_missing(conn, "tasks", "max_parallel", "INTEGER NOT NULL DEFAULT 3")
                self._add_column_if_missing(conn, "tasks", "max_replans", "INTEGER NOT NULL DEFAULT 2")
                self._add_column_if_missing(conn, "tasks", "subtask_token_limit", "INTEGER NOT NULL DEFAULT 50000")
                self._add_column_if_missing(conn, "tasks", "subtask_retry_limit", "INTEGER NOT NULL DEFAULT 2")
                self._add_column_if_missing(conn, "tasks", "allowed_permissions", "JSON NOT NULL DEFAULT '[]'")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL")

                # Add missing agent columns
                self._add_column_if_missing(conn, "agents", "permission_set", "JSON NOT NULL DEFAULT '[]'")
                self._add_column_if_missing(conn, "agents", "verification_status", "TEXT NOT NULL DEFAULT 'declared'")
                self._add_column_if_missing(conn, "agents", "verified_at", "TEXT")

                # Create subtasks table
                conn.execute("""
                CREATE TABLE IF NOT EXISTS subtasks (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    step_key TEXT NOT NULL,
                    plan_version INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
                    legacy_planstep_id TEXT,
                    parent_step_key TEXT,
                    goal TEXT NOT NULL,
                    role TEXT NOT NULL,
                    required_permissions JSON NOT NULL DEFAULT '[]',
                    acceptance_criteria JSON NOT NULL DEFAULT '[]',
                    depends_on JSON NOT NULL DEFAULT '[]',
                    context JSON NOT NULL DEFAULT '{}',
                    max_retries INTEGER NOT NULL DEFAULT 2,
                    token_limit INTEGER,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','success','failed','skipped','cancelled','retrying','blocked','superseded')),
                    assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    result_summary TEXT,
                    result_structured JSON,
                    artifacts JSON,
                    verification_status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending','passed','failed','inconclusive')),
                    verification_notes TEXT,
                    execution_error TEXT,
                    token_input INTEGER NOT NULL DEFAULT 0,
                    token_output INTEGER NOT NULL DEFAULT 0,
                    token_usage_source TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (token_usage_source IN ('measured','estimated','unknown','error')),
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    execution_id TEXT,
                    request_fingerprint TEXT,
                    step_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    started_at TEXT,
                    finished_at TEXT,
                    UNIQUE(task_id, plan_version, step_key),
                    UNIQUE(execution_id)
                )""")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_subtasks_task ON subtasks(task_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_subtasks_active ON subtasks(task_id, is_active)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_subtasks_legacy ON subtasks(legacy_planstep_id) WHERE legacy_planstep_id IS NOT NULL")

                # Data migration: plan_steps -> subtasks
                conn.execute("""
                INSERT INTO subtasks (
                    id, task_id, step_key, legacy_planstep_id, goal, role, depends_on, status,
                    result_summary, execution_error, step_order, created_at, started_at, finished_at
                )
                SELECT ps.id, ps.task_id, ps.step_key, ps.id, ps.goal, ps.role, ps.depends_on,
                    CASE ps.status
                        WHEN 'completed' THEN 'success'
                        WHEN 'failed' THEN 'failed'
                        WHEN 'running' THEN 'running'
                        WHEN 'cancelled' THEN 'cancelled'
                        ELSE 'pending' END,
                    ps.result, ps.error, ps.step_order, ps.created_at, ps.started_at, ps.finished_at
                FROM plan_steps ps
                WHERE NOT EXISTS (SELECT 1 FROM subtasks s WHERE s.legacy_planstep_id = ps.id)
                """)

                # Update agent_runs columns
                self._add_column_if_missing(conn, "agent_runs", "subtask_id", "TEXT REFERENCES subtasks(id) ON DELETE CASCADE")
                self._add_column_if_missing(conn, "agent_runs", "execution_id", "TEXT")
                self._add_column_if_missing(conn, "agent_runs", "request_fingerprint", "TEXT")
                self._add_column_if_missing(conn, "agent_runs", "confidence", "REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0))")
                self._add_column_if_missing(conn, "agent_runs", "verification_passed", "INTEGER")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_agentruns_execution ON agent_runs(execution_id)")

                # Link agent_runs to subtasks
                conn.execute("""
                UPDATE agent_runs SET subtask_id = (
                    SELECT s.id FROM subtasks s WHERE s.legacy_planstep_id = agent_runs.step_id
                ) WHERE subtask_id IS NULL AND EXISTS (
                    SELECT 1 FROM subtasks s WHERE s.legacy_planstep_id = agent_runs.step_id
                )""")

                # Create reservations and task_events
                conn.execute("""
                CREATE TABLE IF NOT EXISTS reservations (
                    reservation_id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    subtask_id TEXT,
                    caller_id TEXT NOT NULL,
                    tokens_reserved INTEGER NOT NULL CHECK (tokens_reserved > 0),
                    calls_reserved INTEGER NOT NULL CHECK (calls_reserved >= 1),
                    status TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','COMMITTED','RELEASED','EXPIRED')),
                    input_tokens INTEGER, output_tokens INTEGER,
                    tokens_charged INTEGER, calls_charged INTEGER,
                    usage_source TEXT CHECK (usage_source IN ('measured','estimated','unknown')),
                    settle_fingerprint TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    resolved_at TEXT,
                    CHECK ((status IN ('COMMITTED','RELEASED') AND resolved_at IS NOT NULL AND tokens_charged IS NOT NULL AND calls_charged IS NOT NULL)
                        OR (status IN ('PENDING','EXPIRED')))
                )""")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_reservations_task ON reservations(task_id)")

                conn.execute("""
                CREATE TABLE IF NOT EXISTS task_events (
                    event_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    sequence INTEGER NOT NULL, event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                    actor_type TEXT NOT NULL, actor_id TEXT, subtask_id TEXT,
                    payload JSON NOT NULL DEFAULT '{}', schema_version INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(task_id, sequence)
                )""")

                conn.execute("INSERT OR REPLACE INTO _nexus_meta VALUES ('schema_version', '3')")

            elif source_version == "2":
                # v2 to v3 migration
                self._add_column_if_missing(conn, "tasks", "idempotency_key", "TEXT")
                self._add_column_if_missing(conn, "tasks", "allowed_permissions", "JSON NOT NULL DEFAULT '[]'")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL")

                self._add_column_if_missing(conn, "tasks", "max_total_tokens", "INTEGER NOT NULL DEFAULT 200000")
                self._add_column_if_missing(conn, "tasks", "max_model_calls", "INTEGER NOT NULL DEFAULT 20")
                self._add_column_if_missing(conn, "tasks", "max_steps", "INTEGER NOT NULL DEFAULT 10")
                self._add_column_if_missing(conn, "tasks", "max_agents", "INTEGER NOT NULL DEFAULT 5")
                self._add_column_if_missing(conn, "tasks", "max_parallel", "INTEGER NOT NULL DEFAULT 3")
                self._add_column_if_missing(conn, "tasks", "max_replans", "INTEGER NOT NULL DEFAULT 2")
                self._add_column_if_missing(conn, "tasks", "subtask_token_limit", "INTEGER NOT NULL DEFAULT 50000")
                self._add_column_if_missing(conn, "tasks", "subtask_retry_limit", "INTEGER NOT NULL DEFAULT 2")
                self._add_column_if_missing(conn, "tasks", "approval_status", "TEXT NOT NULL DEFAULT 'none'")
                self._add_column_if_missing(conn, "tasks", "replan_count", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "tasks", "verifier_result", "JSON")
                self._add_column_if_missing(conn, "tasks", "closed_at", "TEXT")

                self._add_column_if_missing(conn, "agents", "permission_set", "JSON NOT NULL DEFAULT '[]'")
                self._add_column_if_missing(conn, "agents", "verification_status", "TEXT NOT NULL DEFAULT 'declared'")
                self._add_column_if_missing(conn, "agents", "verified_at", "TEXT")

                self._add_column_if_missing(conn, "subtasks", "plan_version", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "subtasks", "is_active", "INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))")
                self._add_column_if_missing(conn, "subtasks", "legacy_planstep_id", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "parent_step_key", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "required_permissions", "JSON NOT NULL DEFAULT '[]'")
                self._add_column_if_missing(conn, "subtasks", "acceptance_criteria", "JSON NOT NULL DEFAULT '[]'")
                self._add_column_if_missing(conn, "subtasks", "context", "JSON NOT NULL DEFAULT '{}'")
                self._add_column_if_missing(conn, "subtasks", "max_retries", "INTEGER NOT NULL DEFAULT 2")
                self._add_column_if_missing(conn, "subtasks", "token_limit", "INTEGER")
                self._add_column_if_missing(conn, "subtasks", "assigned_agent_id", "TEXT REFERENCES agents(id) ON DELETE SET NULL")
                self._add_column_if_missing(conn, "subtasks", "result_summary", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "result_structured", "JSON")
                self._add_column_if_missing(conn, "subtasks", "artifacts", "JSON")
                self._add_column_if_missing(conn, "subtasks", "verification_status", "TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','passed','failed','inconclusive'))")
                self._add_column_if_missing(conn, "subtasks", "verification_notes", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "execution_error", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "token_input", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "subtasks", "token_output", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "subtasks", "token_usage_source", "TEXT NOT NULL DEFAULT 'unknown' CHECK (token_usage_source IN ('measured','estimated','unknown','error'))")
                self._add_column_if_missing(conn, "subtasks", "attempt_count", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "subtasks", "execution_id", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "request_fingerprint", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "step_order", "INTEGER NOT NULL DEFAULT 0")
                self._add_column_if_missing(conn, "subtasks", "started_at", "TEXT")
                self._add_column_if_missing(conn, "subtasks", "finished_at", "TEXT")

                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_plan_key ON subtasks(task_id, plan_version, step_key)")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_execution ON subtasks(execution_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_subtasks_task ON subtasks(task_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_subtasks_active ON subtasks(task_id, is_active)")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_subtasks_legacy ON subtasks(legacy_planstep_id) WHERE legacy_planstep_id IS NOT NULL")

                self._add_column_if_missing(conn, "agent_runs", "subtask_id", "TEXT REFERENCES subtasks(id) ON DELETE CASCADE")
                self._add_column_if_missing(conn, "agent_runs", "execution_id", "TEXT")
                self._add_column_if_missing(conn, "agent_runs", "request_fingerprint", "TEXT")
                self._add_column_if_missing(conn, "agent_runs", "confidence", "REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0))")
                self._add_column_if_missing(conn, "agent_runs", "verification_passed", "INTEGER")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_agentruns_execution ON agent_runs(execution_id)")

                conn.execute("""
                CREATE TABLE IF NOT EXISTS reservations (
                    reservation_id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    subtask_id TEXT,
                    caller_id TEXT NOT NULL,
                    tokens_reserved INTEGER NOT NULL CHECK (tokens_reserved > 0),
                    calls_reserved INTEGER NOT NULL CHECK (calls_reserved >= 1),
                    status TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','COMMITTED','RELEASED','EXPIRED')),
                    input_tokens INTEGER, output_tokens INTEGER,
                    tokens_charged INTEGER, calls_charged INTEGER,
                    usage_source TEXT CHECK (usage_source IN ('measured','estimated','unknown')),
                    settle_fingerprint TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    resolved_at TEXT,
                    CHECK ((status IN ('COMMITTED','RELEASED') AND resolved_at IS NOT NULL AND tokens_charged IS NOT NULL AND calls_charged IS NOT NULL)
                        OR (status IN ('PENDING','EXPIRED')))
                )""")
                conn.execute("CREATE INDEX IF NOT EXISTS ix_reservations_task ON reservations(task_id)")

                conn.execute("""
                CREATE TABLE IF NOT EXISTS task_events (
                    event_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    sequence INTEGER NOT NULL, event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                    actor_type TEXT NOT NULL, actor_id TEXT, subtask_id TEXT,
                    payload JSON NOT NULL DEFAULT '{}', schema_version INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(task_id, sequence)
                )""")

                # Strict v2 version update (asserting previous version was 2)
                cur = conn.execute("UPDATE _nexus_meta SET value='3' WHERE key='schema_version' AND value='2'")
                if cur.rowcount != 1:
                    raise MigrationError("Failed to update schema_version from 2 to 3")

            # Injected failure simulation for rollback testing
            if fail_at_step == "before_post_check":
                raise MigrationError("Simulated failure before post-check assertions")

            # 3. EXECUTABLE POST-CHECK ASSERTIONS (INSIDE THE TRANSACTION!)
            self._assert_post_checks(conn, source_version)

            if fail_at_step == "after_post_check":
                raise MigrationError("Simulated failure after post-check assertions")

            # Everything asserted successfully -> COMMIT
            conn.commit()

        except Exception as e:
            conn.rollback()
            raise MigrationError(f"Migration failed from {source_version}: {e}") from e

    def _assert_post_checks(self, conn: sqlite3.Connection, source_version: str) -> None:
        """Strict post-check assertions run inside transaction before commit."""
        # 1. Schema version must be exactly '3'
        v = conn.execute("SELECT value FROM _nexus_meta WHERE key='schema_version'").fetchone()
        if not v or str(v[0]) != "3":
            raise MigrationError(f"Post-check assertion failed: schema_version is {v}, expected 3")

        # 2. No duplicate active or versioned subtasks
        dup = conn.execute(
            "SELECT task_id, plan_version, step_key, COUNT(*) FROM subtasks GROUP BY 1,2,3 HAVING COUNT(*) > 1"
        ).fetchall()
        if dup:
            raise MigrationError(f"Post-check assertion failed: duplicate subtask keys found: {dup}")

        # 3. No orphan agent_runs
        orphans = conn.execute("""
            SELECT ar.id FROM agent_runs ar
            LEFT JOIN subtasks s ON ar.subtask_id = s.id
            WHERE ar.subtask_id IS NOT NULL AND s.id IS NULL
        """).fetchall()
        if orphans:
            raise MigrationError(f"Post-check assertion failed: orphan agent_runs found: {orphans}")

        # 4. tasks.allowed_permissions must exist
        cols = self._get_table_columns(conn, "tasks")
        if "allowed_permissions" not in cols:
            raise MigrationError("Post-check assertion failed: tasks.allowed_permissions column is missing")

        # 5. All essential tables must exist
        for tbl in ("tasks", "agents", "subtasks", "agent_runs", "reservations", "task_events"):
            has_tbl = conn.execute(
                f"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{tbl}'"
            ).fetchone()[0] > 0
            if not has_tbl:
                raise MigrationError(f"Post-check assertion failed: missing required table '{tbl}'")
