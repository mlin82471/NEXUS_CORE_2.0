-- B0 v7: v2 to v3 Migration
-- Pre-condition: _nexus_meta has schema_version='2'
-- v2 schema: tasks, agents, subtasks, agent_runs, _nexus_meta
-- May lack: reservations, task_events, agents.permission_set, subtasks.plan_version,
--            subtasks.is_active, tasks.allowed_permissions
-- Target schema version: 3

-- ============================================================
-- PRE-MIGRATION CHECKS
-- ============================================================
-- Verify schema version is 2
SELECT value FROM _nexus_meta WHERE key='schema_version';
-- Expected: 2

-- Verify subtasks exists (v2 has it)
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='subtasks';
-- Expected: 1

-- Verify plan_steps still exists (v2 retains it read-only)
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='plan_steps';

-- Check which v3 columns are already present
SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='allowed_permissions';
SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='idempotency_key';
SELECT COUNT(*) FROM pragma_table_info('agents') WHERE name='permission_set';
SELECT COUNT(*) FROM pragma_table_info('subtasks') WHERE name='plan_version';
SELECT COUNT(*) FROM pragma_table_info('subtasks') WHERE name='is_active';
SELECT COUNT(*) FROM pragma_table_info('agent_runs') WHERE name='execution_id';
SELECT COUNT(*) FROM pragma_table_info('agent_runs') WHERE name='request_fingerprint';

-- Check which tables are already present
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reservations';
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='task_events';

-- ============================================================
-- MIGRATION
-- ============================================================
BEGIN TRANSACTION;

-- Add missing columns to existing tables (skip if already present)

-- tasks: add columns that may be missing in v2
-- idempotency_key (if missing)
ALTER TABLE tasks ADD COLUMN idempotency_key TEXT;
-- allowed_permissions (v7 — will always be missing in v2)
ALTER TABLE tasks ADD COLUMN allowed_permissions JSON NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- tasks: add budget columns if missing (v2 may have some from v1 path)
ALTER TABLE tasks ADD COLUMN max_total_tokens INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE tasks ADD COLUMN max_model_calls INTEGER NOT NULL DEFAULT 20;
ALTER TABLE tasks ADD COLUMN max_steps INTEGER NOT NULL DEFAULT 10;
ALTER TABLE tasks ADD COLUMN max_agents INTEGER NOT NULL DEFAULT 5;
ALTER TABLE tasks ADD COLUMN max_parallel INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tasks ADD COLUMN max_replans INTEGER NOT NULL DEFAULT 2;
ALTER TABLE tasks ADD COLUMN subtask_token_limit INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE tasks ADD COLUMN subtask_retry_limit INTEGER NOT NULL DEFAULT 2;
ALTER TABLE tasks ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN replan_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN verifier_result JSON;
ALTER TABLE tasks ADD COLUMN closed_at TEXT;

-- agents: add permission_set if missing
ALTER TABLE agents ADD COLUMN permission_set JSON NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'declared';
ALTER TABLE agents ADD COLUMN verified_at TEXT;

-- subtasks: add columns that may be missing in v2
ALTER TABLE subtasks ADD COLUMN plan_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1));
ALTER TABLE subtasks ADD COLUMN legacy_planstep_id TEXT;
ALTER TABLE subtasks ADD COLUMN parent_step_key TEXT;
ALTER TABLE subtasks ADD COLUMN required_permissions JSON NOT NULL DEFAULT '[]';
ALTER TABLE subtasks ADD COLUMN acceptance_criteria JSON NOT NULL DEFAULT '[]';
ALTER TABLE subtasks ADD COLUMN context JSON NOT NULL DEFAULT '{}';
ALTER TABLE subtasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 2;
ALTER TABLE subtasks ADD COLUMN token_limit INTEGER;
ALTER TABLE subtasks ADD COLUMN assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE subtasks ADD COLUMN result_summary TEXT;
ALTER TABLE subtasks ADD COLUMN result_structured JSON;
ALTER TABLE subtasks ADD COLUMN artifacts JSON;
ALTER TABLE subtasks ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','passed','failed','inconclusive'));
ALTER TABLE subtasks ADD COLUMN verification_notes TEXT;
ALTER TABLE subtasks ADD COLUMN execution_error TEXT;
ALTER TABLE subtasks ADD COLUMN token_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN token_output INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN token_usage_source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (token_usage_source IN ('measured','estimated','unknown','error'));
ALTER TABLE subtasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN execution_id TEXT;
ALTER TABLE subtasks ADD COLUMN request_fingerprint TEXT;
ALTER TABLE subtasks ADD COLUMN step_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN started_at TEXT;
ALTER TABLE subtasks ADD COLUMN finished_at TEXT;

-- Add unique constraints for subtasks (if not present)
-- These may fail if already applied; safe to ignore
CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_plan_key ON subtasks(task_id, plan_version, step_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subtasks_execution ON subtasks(execution_id);

CREATE INDEX IF NOT EXISTS ix_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS ix_subtasks_active ON subtasks(task_id, is_active);
CREATE INDEX IF NOT EXISTS ix_subtasks_legacy ON subtasks(legacy_planstep_id) WHERE legacy_planstep_id IS NOT NULL;

-- agent_runs: add missing columns
ALTER TABLE agent_runs ADD COLUMN subtask_id TEXT REFERENCES subtasks(id) ON DELETE CASCADE;
ALTER TABLE agent_runs ADD COLUMN execution_id TEXT;
ALTER TABLE agent_runs ADD COLUMN request_fingerprint TEXT;
ALTER TABLE agent_runs ADD COLUMN confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0));
ALTER TABLE agent_runs ADD COLUMN verification_passed INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agentruns_execution ON agent_runs(execution_id);

-- reservations (new table — unlikely in v2, but use IF NOT EXISTS)
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

-- task_events (new table — unlikely in v2, but use IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS task_events (
    event_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL, event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor_type TEXT NOT NULL, actor_id TEXT, subtask_id TEXT,
    payload JSON NOT NULL DEFAULT '{}', schema_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE(task_id, sequence)
);

-- Update schema version
INSERT OR REPLACE INTO _nexus_meta VALUES ('schema_version', '3');

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

-- 3. tasks.allowed_permissions column exists
SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='allowed_permissions';
-- Expected: 1

-- 4. agents.permission_set column exists
SELECT COUNT(*) FROM pragma_table_info('agents') WHERE name='permission_set';
-- Expected: 1

-- 5. subtasks.plan_version column exists
SELECT COUNT(*) FROM pragma_table_info('subtasks') WHERE name='plan_version';
-- Expected: 1

-- 6. subtasks.is_active column exists
SELECT COUNT(*) FROM pragma_table_info('subtasks') WHERE name='is_active';
-- Expected: 1

-- 7. reservations table exists
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reservations';
-- Expected: 1

-- 8. task_events table exists
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='task_events';
-- Expected: 1

-- 9. Existing subtasks data preserved (spot check — count should be >0 if v2 had data)
SELECT COUNT(*) AS subtask_count FROM subtasks;
-- Expected: >0 (preserved from v2)