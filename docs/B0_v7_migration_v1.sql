-- B0 v7: v1 to v3 Migration
-- Pre-condition: _nexus_meta has schema_version='1'
-- v1 schema: tasks (with plan_json), plan_steps, agent_runs, agents, _nexus_meta
-- Target schema version: 3

-- ============================================================
-- PRE-MIGRATION CHECKS
-- ============================================================
-- Verify schema version is 1
SELECT value FROM _nexus_meta WHERE key='schema_version';
-- Expected: 1

-- Verify plan_steps exists
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='plan_steps';
-- Expected: 1

-- Verify no subtasks table yet (v1 doesn't have it)
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='subtasks';
-- Expected: 0

-- Check for duplicate step_keys in plan_steps
SELECT task_id, step_key, COUNT(*) FROM plan_steps GROUP BY task_id, step_key HAVING COUNT(*) > 1;
-- Expected: (empty)

-- Check which budget columns already exist on tasks
-- (v1 may or may not have budget columns depending on how v1 was created)
SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='max_total_tokens';
SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='allowed_permissions';

-- ============================================================
-- MIGRATION
-- ============================================================
BEGIN TRANSACTION;

-- tasks: add missing columns (skip if they already exist — checked at application layer)
-- The application layer runs these ALTER TABLE statements conditionally
-- based on the results of the pragma_table_info pre-checks above.

-- approval_status
-- replan_count
-- verifier_result
-- closed_at
-- idempotency_key
-- max_total_tokens (if not present)
-- max_model_calls (if not present)
-- max_steps (if not present)
-- max_agents (if not present)
-- max_parallel (if not present)
-- max_replans (if not present)
-- subtask_token_limit (if not present)
-- subtask_retry_limit (if not present)
-- allowed_permissions (v7)

-- NOTE: The following ALTER TABLE statements are provided for direct SQL execution.
-- For programmatic execution, the application layer checks column existence first.
-- If a column already exists, skip its ALTER TABLE statement.

-- Conditional: only execute if column doesn't exist
-- These will fail with "duplicate column name" if column exists;
-- the application layer catches and ignores this error.

-- tasks columns (add if missing)
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
ALTER TABLE tasks ADD COLUMN allowed_permissions JSON NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- agents: add missing columns
ALTER TABLE agents ADD COLUMN permission_set JSON NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'declared';
ALTER TABLE agents ADD COLUMN verified_at TEXT;

-- subtasks (new table)
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

-- agent_runs: add missing columns
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

-- reservations (new table)
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

-- task_events (new table)
CREATE TABLE IF NOT EXISTS task_events (
    event_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL, event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor_type TEXT NOT NULL, actor_id TEXT, subtask_id TEXT,
    payload JSON NOT NULL DEFAULT '{}', schema_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE(task_id, sequence)
);

-- Update schema version
UPDATE _nexus_meta SET value='3' WHERE key='schema_version';

COMMIT;

-- ============================================================
-- POST-MIGRATION VALIDATION (EXECUTABLE)
-- ============================================================
-- 1. Schema version is 3
SELECT value FROM _nexus_meta WHERE key='schema_version';
-- Expected: 3

-- 2. No duplicate (task_id, plan_version, step_key)
SELECT task_id, plan_version, step_key, COUNT(*) FROM subtasks GROUP BY 1,2,3 HAVING COUNT(*) > 1;
-- Expected: (empty)

-- 3. agent_runs -> subtasks foreign key integrity
SELECT ar.id FROM agent_runs ar LEFT JOIN subtasks s ON ar.subtask_id=s.id WHERE ar.subtask_id IS NOT NULL AND s.id IS NULL;
-- Expected: (empty)

-- 4. tasks.allowed_permissions column exists
SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='allowed_permissions';
-- Expected: 1

-- 5. All plan_steps migrated
SELECT COUNT(*) AS plan_steps_count FROM plan_steps;
SELECT COUNT(*) AS subtasks_count FROM subtasks;
-- Expected: plan_steps_count = subtasks_count

-- 6. reservation table exists
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reservations';
-- Expected: 1

-- 7. task_events table exists
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='task_events';
-- Expected: 1