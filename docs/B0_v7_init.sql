-- B0 v7: Fresh Database Initialization DDL
-- Run when no _nexus_meta table and no tasks table exist
-- Target schema version: 3

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS _nexus_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO _nexus_meta VALUES ('schema_version', '3');

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    risk_suggestion TEXT,
    risk_level TEXT,
    approval_status TEXT NOT NULL DEFAULT 'none'
        CHECK (approval_status IN ('none','pending','approved','denied')),
    replan_count INTEGER NOT NULL DEFAULT 0,
    verifier_result JSON,
    closed_at TEXT,
    idempotency_key TEXT,
    -- Budget columns: immutable after task status >= 'running'
    max_total_tokens INTEGER NOT NULL DEFAULT 200000,
    max_model_calls INTEGER NOT NULL DEFAULT 20,
    max_steps INTEGER NOT NULL DEFAULT 10,
    max_agents INTEGER NOT NULL DEFAULT 5,
    max_parallel INTEGER NOT NULL DEFAULT 3,
    max_replans INTEGER NOT NULL DEFAULT 2,
    subtask_token_limit INTEGER NOT NULL DEFAULT 50000,
    subtask_retry_limit INTEGER NOT NULL DEFAULT 2,
    -- v7: permission persistence
    allowed_permissions JSON NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);
CREATE UNIQUE INDEX uq_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    adapter_type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    capabilities JSON NOT NULL DEFAULT '[]',
    permission_set JSON NOT NULL DEFAULT '[]',
    verification_status TEXT NOT NULL DEFAULT 'declared'
        CHECK (verification_status IN ('declared','connected','verified','expired','failed_verification','disabled')),
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subtasks (
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
CREATE INDEX ix_subtasks_task ON subtasks(task_id);
CREATE INDEX ix_subtasks_active ON subtasks(task_id, is_active);
CREATE INDEX ix_subtasks_legacy ON subtasks(legacy_planstep_id) WHERE legacy_planstep_id IS NOT NULL;

CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    subtask_id TEXT REFERENCES subtasks(id) ON DELETE CASCADE,
    execution_id TEXT,
    request_fingerprint TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    usage_source TEXT NOT NULL DEFAULT 'unknown'
        CHECK (usage_source IN ('measured','estimated','unknown','error')),
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
    verification_passed INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    UNIQUE(execution_id)
);

CREATE TABLE reservations (
    reservation_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    subtask_id TEXT,
    caller_id TEXT NOT NULL,
    tokens_reserved INTEGER NOT NULL CHECK (tokens_reserved > 0),
    calls_reserved INTEGER NOT NULL CHECK (calls_reserved >= 1),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','COMMITTED','RELEASED','EXPIRED')),
    input_tokens INTEGER,
    output_tokens INTEGER,
    tokens_charged INTEGER,
    calls_charged INTEGER,
    usage_source TEXT CHECK (usage_source IN ('measured','estimated','unknown')),
    settle_fingerprint TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    CHECK (
        (status IN ('COMMITTED','RELEASED') AND resolved_at IS NOT NULL
         AND tokens_charged IS NOT NULL AND calls_charged IS NOT NULL)
        OR
        (status IN ('PENDING','EXPIRED'))
    )
);
CREATE INDEX ix_reservations_task ON reservations(task_id);

CREATE TABLE task_events (
    event_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    subtask_id TEXT,
    payload JSON NOT NULL DEFAULT '{}',
    schema_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE(task_id, sequence)
);

COMMIT;