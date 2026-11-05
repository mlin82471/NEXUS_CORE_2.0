-- B0 v7: M0-A to v3 Migration
-- Pre-condition: no _nexus_meta table, tasks table exists, plan_steps table exists
-- Target schema version: 3

-- ============================================================
-- PRE-MIGRATION CHECKS
-- ============================================================
-- Verify plan_steps exists
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='plan_steps';
-- Verify no _nexus_meta (would indicate already migrated)
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_nexus_meta';
-- Check for duplicate step_keys (should return 0)
SELECT task_id, step_key, COUNT(*) FROM plan_steps GROUP BY task_id, step_key HAVING COUNT(*) > 1;

-- ============================================================
-- MIGRATION
-- ============================================================
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS _nexus_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- tasks: add missing columns
ALTER TABLE tasks ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN replan_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN verifier_result JSON;
ALTER TABLE tasks ADD COLUMN closed_at TEXT;
ALTER TABLE tasks ADD COLUMN idempotency_key TEXT;
ALTER TABLE tasks ADD COLUMN max_total_tokens INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE tasks ADD COLUMN max_model_calls INTEGER NOT NULL DEFAULT 20;
ALTER TABLE tasks ADD COLUMN max_steps INTEGER NOT NULL DEFAULT 10;
ALTER TABLE tasks ADD COLUMN max_agents INTEGER NOT NULL DEFAULT 5;
ALTER TABLE tasks ADD COLUMN max_parallel INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tasks ADD COLUMN max_replans INTEGER NOT NULL DEFAULT 2;
ALTER TABLE tasks ADD COLUMN subtask_token_limit INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE tasks ADD COLUMN subtask_retry_limit INTEGER NOT NULL DEFAULT 2;
-- v7: permission persistence
ALTER TABLE tasks ADD COLUMN allowed_permissions JSON NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- agents: add missing columns
ALTER TABLE agents ADD COLUMN permission_set JSON NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'declared';
ALTER TABLE agents ADD COLUMN verified_at TEXT;

-- subtasks
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
);
CREATE INDEX IF NOT EXISTS ix_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS ix_subtasks_active ON subtasks(task_id, is_active);
CREATE INDEX IF NOT EXISTS ix_subtasks_legacy ON subtasks(legacy_planstep_id) WHERE legacy_planstep_id IS NOT NULL;

-- Data migration: plan_steps -> subtasks
INSERT INTO subtasks (id, task_id, step_key, legacy_planstep_id, goal, role, depends_on, status, result_summary, execution_error, step_order, created_at, started_at, finished_at)
SELECT ps.id, ps.task_id, ps.step_key, ps.id, ps.goal, ps.role, ps.depends_on,
    CASE ps.status
        WHEN 'completed' THEN 'success'
        WHEN 'failed' THEN 'failed'
        WHEN 'running' THEN 'running'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'pending' END,
    ps.result, ps.error, ps.step_order, ps.created_at, ps.started_at, ps.finished_at
FROM plan_steps ps;

-- agent_runs: add columns
ALTER TABLE agent_runs ADD COLUMN subtask_id TEXT REFERENCES subtasks(id) ON DELETE CASCADE;
ALTER TABLE agent_runs ADD COLUMN execution_id TEXT;
ALTER TABLE agent_runs ADD COLUMN request_fingerprint TEXT;
ALTER TABLE agent_runs ADD COLUMN confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0));
ALTER TABLE agent_runs ADD COLUMN verification_passed INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agentruns_execution ON agent_runs(execution_id);

-- Link agent_runs to subtasks via legacy_planstep_id
UPDATE agent_runs SET subtask_id = (
    SELECT s.id FROM subtasks s WHERE s.legacy_planstep_id = agent_runs.step_id
) WHERE EXISTS (SELECT 1 FROM subtasks s WHERE s.legacy_planstep_id = agent_runs.step_id);

-- reservations
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
);
CREATE INDEX IF NOT EXISTS ix_reservations_task ON reservations(task_id);

-- task_events
CREATE TABLE IF NOT EXISTS task_events (
    event_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL, event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor_type TEXT NOT NULL, actor_id TEXT, subtask_id TEXT,
    payload JSON NOT NULL DEFAULT '{}', schema_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE(task_id, sequence)
);

INSERT OR REPLACE INTO _nexus_meta VALUES ('schema_version', '3');

COMMIT;

-- ============================================================
-- POST-MIGRATION VALIDATION (EXECUTABLE)
-- ============================================================
-- 1. Schema version is 3
SELECT value FROM _nexus_meta WHERE key='schema_version';
-- Expected: 3

-- 2. No duplicate (task_id, plan_version, step_key) in subtasks
SELECT task_id, plan_version, step_key, COUNT(*) FROM subtasks GROUP BY 1,2,3 HAVING COUNT(*) > 1;
-- Expected: (empty)

-- 3. Every agent_runs with subtask_id references a real subtask
SELECT ar.id FROM agent_runs ar LEFT JOIN subtasks s ON ar.subtask_id=s.id WHERE ar.subtask_id IS NOT NULL AND s.id IS NULL;
-- Expected: (empty)

-- 4. tasks.allowed_permissions column exists and has default
SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks' AND sql LIKE '%allowed_permissions%';
-- Expected: (1 row containing allowed_permissions)

-- 5. All plan_steps were migrated to subtasks
SELECT COUNT(*) AS plan_steps_count FROM plan_steps;
SELECT COUNT(*) AS subtasks_count FROM subtasks;
-- Expected: plan_steps_count = subtasks_count (unless subtasks were pre-existing)

-- 6. Reservation CHECK constraint works
-- (tested in application layer)