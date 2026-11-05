# NEXUS CORE 2.0 — B0: Architecture Contract (M0-B Foundation)
# Version: 7.0 | Status: FROZEN (Final)

## 0. Purpose & Conventions
Strict interface contracts for B1-B10. MUST: mandatory. SHOULD: strongly recommended.

### Terminology
| Term | Definition |
|------|-----------|
| Task | Top-level user request |
| SubTask | Single unit of work for one Agent |
| Active SubTask | is_active=1; participates in aggregation |
| Historical SubTask | is_active=0; audit-only |
| Hard-Terminal SubTask | status IN (FAILED, SKIPPED, CANCELLED, SUPERSEDED); no recovery path |
| Soft-Terminal SubTask | verification_status=INCONCLUSIVE; replan/recovery may still be possible |
| Reservation | Atomic budget hold backed by persistent DB row |
| Charged | Actual measured/estimated/unknown settled against budget |
| permission_set | Agent's declared permissions (labels) |
| required_permissions | Permissions needed for a SubTask's role |
| allowed_permissions | Permissions this Task permits (user-specified, stored on tasks.allowed_permissions) |

---

## 1. Task State Machine

### 1.1 States
| State | Terminal | Definition |
|-------|----------|------------|
| queued | No | Submitted, not planned |
| planning | No | Planner generating SubTask list |
| awaiting_approval | No | High risk/cost plan needs user approval |
| running | No | Active SubTasks being executed |
| success | YES | ALL of: (a) every active SubTask verified PASSED; (b) Task-level verifier returned PASSED |
| partial | YES | ANY of: (a) >=1 active SubTask PASSED but not all; (b) Task-level verifier returned FAILED or INCONCLUSIVE with >=1 PASSED; (c) all active SubTasks INCONCLUSIVE with no replan available |
| failed | YES | ALL of: (a) zero active SubTask PASSED; (b) zero active SubTask INCONCLUSIVE (all active SubTasks are hard-terminal: FAILED/SKIPPED/CANCELLED); (c) no replan available. ALSO: DAG invalid or budget exhausted with zero PASSED and zero INCONCLUSIVE |
| cancelled | YES | User or system cancelled before terminal |
| closed | YES | Archived from another terminal |

> **v7 FIX**: `failed` now explicitly requires "zero active SubTask INCONCLUSIVE" — resolves the INCONCLUSIVE conflict between §1.1 and §1.4. A task with all-INCONCLUSIVE and replan available is NOT failed; it replans. All-INCONCLUSIVE with no replan resolves to `partial`, not `failed`, because INCONCLUSIVE is not a hard failure.

### 1.2 Transition Table
FROM\TO          queued plan appr run  succ part fail canc closed
queued             -    YES  NO   NO   NO   NO   NO   YES  NO
planning           NO    -   YES  YES  NO   NO   YES  YES  NO
awaiting_approval  NO   NO    -   YES  NO   NO   NO   YES  NO
running            NO   YES   NO   -   YES  YES  YES  YES  NO
success            NO   NO   NO   NO   -    NO   NO   NO   YES
partial            NO   NO   NO   NO   NO   -    NO   NO   YES
failed             NO   NO   NO   NO   NO   NO   -    NO   YES
cancelled          NO   NO   NO   NO   NO   NO   NO   -    YES
closed             NO   NO   NO   NO   NO   NO   NO   NO   -

### 1.3 CAS Interface
```
transition(task_id, expected_state, new_state, transition_id, context)
  -> {task_id, old_state, new_state, transition_id}
Raises: StateConflictError, InvalidTransitionError, DuplicateTransitionError
```
State update + task_events INSERT in same transaction.

### 1.4 Task Aggregation Decision Table (Definitive, v7 Verified)

**Only is_active=1 SubTasks participate. Task-level Verifier runs after all active SubTasks complete.**

| # | Active SubTask States | Task Verifier | Replan? | Result | Zero-PASSED? |
|---|----------------------|---------------|---------|--------|-------------|
| 1 | All PASSED | PASSED | - | success | No |
| 2 | All PASSED | FAILED | - | partial | No |
| 3 | All PASSED | INCONCLUSIVE | - | partial | No |
| 4 | All FAILED | any | No | failed | YES |
| 5 | All FAILED | any | Yes | replan (running->planning) | YES |
| 6 | All SKIPPED | any | - | failed | YES |
| 7 | All CANCELLED | any | - | cancelled | YES |
| 8 | All INCONCLUSIVE | any | No | partial | YES |
| 9 | All INCONCLUSIVE | any | Yes | replan | YES |
| 10 | >=1 PASSED + >=1 FAILED | any | - | partial | No |
| 11 | >=1 PASSED + >=1 SKIPPED | any | - | partial | No |
| 12 | >=1 PASSED + >=1 INCONCLUSIVE | any | - | partial | No |
| 13 | >=1 PASSED + mix | any | - | partial | No |
| 14 | Contains BLOCKED unresolved | - | - | NOT terminal | - |
| 15 | Contains PENDING/RUNNING/RETRYING | - | - | NOT terminal | - |
| 16 | 0 active SubTasks (all SUPERSEDED) | - | - | failed | YES |

> **v7 Clarification**: Zero-PASSED column added for transparency. Rows 4, 6, 7, 8, 9, 16 are zero-PASSED scenarios. Rows 8 and 9 are NOT `failed` because INCONCLUSIVE ≠ hard failure. Row 16 (all SUPERSEDED) is `failed` because there are zero active SubTasks to evaluate.

Replan decision: only if replan_count < max_replans AND can_replan() AND at least one SubTask with verification_status='inconclusive'. Replan eligibility requires at least one INCONCLUSIVE active SubTask.

---

## 2. SubTask Model

### 2.1 Statuses
PENDING, RUNNING, SUCCESS, FAILED, SKIPPED, CANCELLED, RETRYING, BLOCKED, SUPERSEDED

SUPERSEDED: terminal, replaced by newer plan_version. Excluded from aggregation.
BLOCKED: transient, waiting for upstream INCONCLUSIVE retry to resolve.

### 2.2 Fields
```
SubTask:
  id: UUID PK
  task_id: FK
  step_key: str (unique per task+plan_version)
  plan_version: int (0=original)
  is_active: int (1=active, 0=historical)
  parent_step_key: str|null
  goal: str (max 5000)
  role: str (from ROLES)
  required_permissions: [str] (derived from role)
  acceptance_criteria: [str]
  depends_on: [str]
  context: dict (<=64KB UTF-8)
  max_retries: int
  token_limit: int|null
  status: SubTaskStatus
  assigned_agent_id: str|null
  result_summary, result_structured, artifacts
  verification_status, verification_notes
  execution_error: str|null (agent crash, separate from verification)
  token_input, token_output, token_usage_source
  attempt_count: int
  execution_id: str|null (UNIQUE)
  request_fingerprint: str|null (SHA256)
  step_order: int
  created_at, started_at, finished_at
```

### 2.3 Role-to-Permission Mapping (Derived)
This mapping is the SINGLE authoritative source for required_permissions.
No alternative derivation allowed.

| Role | required_permissions |
|------|---------------------|
| analysis | ["read_data","reason"] |
| coding | ["read_files","write_files","execute_code"] |
| verification | ["read_data","validate"] |
| execution | ["execute_code","write_files"] |
| knowledge | ["read_data","search"] |
| research | ["read_data","search","reason"] |

required_permissions on SubTask is set from this table at plan creation.
If role is not in this table: task -> failed (unknown_role event).

### 2.4 Retry Rules
RETRYING: clear result_summary, result_structured, artifacts, verification_status, execution_error.
verification_status -> PENDING. execution_id -> new UUID.
Old AgentRun and verification record preserved as history.

### 2.5 BLOCKED Recovery
On restart: check upstream SubTask status.
If upstream resolved: unblock (PENDING or SKIPPED based on upstream result).
If upstream still INCONCLUSIVE with retry: remain BLOCKED.
If upstream FAILED: SKIPPED.

---

## 3. Agent Protocol (unchanged)

AgentResult: result, input_tokens, output_tokens, usage_source, confidence, artifacts, metadata.
AgentProtocol: run, capabilities_match, estimated_tokens, health_check.
Adapter MUST enforce timeout via threading/multiprocessing.

---

## 4. Agent Selection with Permission Contract

### 4.1 Permission Model
```
task.allowed_permissions: [str]     # User-specified, stored on Task (JSON column)
subtask.required_permissions: [str]  # Derived from role (see §2.3)
agent.permission_set: [str]         # Declared by agent at registration
```

### 4.2 Eligibility (all MUST pass)
1. enabled == True
2. verification_status == "verified" AND within validity window
3. health_check() == True
4. capabilities_match(required_capabilities) == True
5. permission_check:
   a. agent.permission_set MUST be superset-or-equal of subtask.required_permissions
   b. agent.permission_set MUST NOT contain permissions outside task.allowed_permissions
   c. agent.permission_set MUST NOT be null/empty (default-deny for undefined)
   d. task.allowed_permissions MUST NOT be null/empty (default-deny for undefined)

### 4.3 Default-Deny Rules
- agent.permission_set not declared -> DENY
- agent.permission_set empty -> DENY
- task.allowed_permissions not specified -> DENY
- task.allowed_permissions empty -> DENY
- agent has permission NOT in task.allowed_permissions -> DENY (not just ignore)

### 4.4 Fallback Permission Rules
Fallback agent MUST pass ALL same permission checks. No exceptions.

### 4.5 Selection Priority
1. Exact role + all eligibility -> return
2. Fallback (FALLBACK_MAP) + all eligibility -> return, emit agent_fallback
3. AgentSelectionError with detailed eligibility_failures

### 4.6 Permission Check Function (Protocol)
```python
def check_permissions(
    agent_permission_set: list[str],
    required_permissions: list[str],
    task_allowed_permissions: list[str],
) -> tuple[bool, str | None]:
    """Returns (allowed, denial_reason).

    Checks in order:
    1. agent_permission_set is non-empty
    2. task_allowed_permissions is non-empty
    3. required_permissions ⊆ agent_permission_set
    4. agent_permission_set ⊆ task_allowed_permissions

    Returns (False, reason) on first denial; (True, None) if all pass.
    """
```
This function is the SINGLE authoritative permission check. No alternative implementation allowed.

---

## 5. Budget Model

### 5.1 Budget Configuration (Persistent, Immutable After Start)
Stored on Task creation; **IMMUTABLE after task enters 'running' state**.
Enforcement: budget columns are write-once — set at task creation, validated at transition to 'running', and never modified thereafter. Any attempt to UPDATE budget columns when status >= 'running' is rejected at the Persistence layer.
```
TaskBudget:
  max_total_tokens: int = 200000    # Hard cap, cumulative across all plan versions
  max_model_calls: int = 20          # Hard cap, cumulative across all plan versions
  max_steps: int = 10                # Cumulative SubTask count (total across all plan versions)
  max_agents: int = 5                # Cumulative distinct agent IDs (across all plan versions)
  max_parallel: int = 3              # Max concurrent
  max_replans: int = 2               # Max replan cycles
  subtask_token_limit: int = 50000   # Per-SubTask hard cap
  subtask_retry_limit: int = 2       # Per-SubTask additional retries
```
> **v7 Clarification**: max_steps and max_agents are cumulative across all plan versions for a given task. A task that goes through 2 replans counts all SubTasks and all distinct agents from all versions against these cumulative limits.

Persisted as task columns. BudgetTracker reads from DB.

### 5.2 Reservation DDL (unchanged from v5)
Status: PENDING, COMMITTED, RELEASED, EXPIRED.
tokens_charged = actual (not truncated to reserved).
Overrun allowed; triggers budget_exhausted if remaining goes negative.

### 5.3 Budget Per State
| Status | Tokens counted against budget | Calls counted |
|--------|------------------------------|---------------|
| PENDING | tokens_reserved | calls_reserved |
| COMMITTED | tokens_charged | calls_charged |
| RELEASED | 0 | 0 |
| EXPIRED | tokens_reserved | calls_reserved |

RELEASED reservations: tokens_charged=0, calls_charged=0 (confirmed not executed).
release() only allowed when caller confirms execution did NOT happen.

### 5.4 RemainingBudget Formula
```
remaining_tokens = max_total_tokens
  - SUM(committed.tokens_charged)
  - SUM(pending.tokens_reserved)
  - SUM(expired.tokens_reserved)

remaining_calls = max_model_calls
  - SUM(committed.calls_charged)
  - SUM(pending.calls_reserved)
  - SUM(expired.calls_reserved)

COMMITTED: use tokens_charged/calls_charged (actual, may exceed reserved)
PENDING: use tokens_reserved/calls_reserved (conservative, assume consumption)
EXPIRED: use tokens_reserved/calls_reserved (conservative, assume full consumption)
RELEASED: exclude entirely (confirmed 0 consumption)
```

### 5.5 Unknown Usage Conservative Estimate
```
unknown_charge = min(subtask_token_limit, max(reserved_tokens, subtask_token_limit / 2))
```
Rationale: unknown could be anywhere from 0 to limit; charge conservatively to prevent budget bypass.
Persisted: usage_source='unknown', tokens_charged=unknown_charge.

**Full Settlement Flow (v7):**
1. Agent returns result with usage_source='unknown'
2. BudgetTracker computes unknown_charge using formula above
3. Reservation settled: status='COMMITTED', tokens_charged=unknown_charge, calls_charged=1, usage_source='unknown'
4. BudgetTracker recalculates remaining budget
5. If remaining < 0: trigger budget_exhausted event
6. SubTask marked with token_usage_source='unknown', token_input/token_output=0 (unknown)

### 5.6 Budget Recovery on Restart
1. expire_pending(task_id): UPDATE SET status='EXPIRED' WHERE status='PENDING'.
2. Recalculate remaining: subtract COMMITTED+PENDING(now EXPIRED).
3. EXPIRED reservations never return to PENDING.

---

## 6. Event Protocol

### 6.1 Sequence Allocation with Concurrent Write Handling (v7)
Uses `BEGIN IMMEDIATE` to reserve write lock immediately, preventing concurrent sequence conflicts. Handles `SQLITE_BUSY` with exponential backoff retry (up to 5 attempts).
```python
def write_event(db, task_id, event_type, actor_type, **kwargs):
    for attempt in range(5):
        try:
            db.execute("BEGIN IMMEDIATE")
            seq = db.execute(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM task_events WHERE task_id=?",
                [task_id]).fetchone()[0]
            db.execute(
                "INSERT INTO task_events(event_id,task_id,sequence,event_type,actor_type,actor_id,subtask_id,payload) "
                "VALUES (?,?,?,?,?,?,?,?)",
                [uid(), task_id, seq, event_type, actor_type,
                 kwargs.get('actor_id'), kwargs.get('subtask_id'),
                 json.dumps(kwargs.get('payload', {}))])
            db.commit()
            return
        except sqlite3.IntegrityError:
            db.rollback()
            if attempt == 4:
                raise EventSequenceConflictError()
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e).lower():
                db.rollback()
                time.sleep(0.05 * (2 ** attempt))
                if attempt == 4:
                    raise EventWriteError("SQLITE_BUSY after 5 retries")
            else:
                raise
```
Key changes from v6: (a) `BEGIN IMMEDIATE` instead of plain `BEGIN`; (b) SQLITE_BUSY handling with exponential backoff; (c) up to 5 retries.

### 6.2 Types
plan_started/completed/failed/revised, approval_requested/granted/denied,
task_started/resumed, wave_started/completed,
subtask_started/completed/skipped/retrying, agent_fallback, agent_selection_failed,
verification_started/passed/failed/inconclusive,
retry_initiated, replan_triggered, agent_replaced,
task_finished/cancelled/failed/closed, dag_invalid, budget_exhausted,
subtask_superseded, permission_denied, unknown_role,
fingerprint_conflict, late_result_rejected

---

## 7. Database Migration

### 7.1 Version Paths
| From | To | Method |
|------|----|--------|
| Empty (no _nexus_meta, no tasks) | v3 | Fresh init DDL (§7.2) |
| M0-A (no _nexus_meta, tasks exists) | v3 | M0-A migration (§7.3) |
| v1 (_nexus_meta=1) | v3 | v1-v3 upgrade (§7.4) |
| v2 (_nexus_meta=2) | v3 | v2-v3 upgrade (§7.5) |
| v3 | - | Current, skip |
| >v3 | - | Refuse startup |
| Invalid version | - | Refuse startup |

### 7.2 Fresh Init DDL
Single transaction creating all tables: _nexus_meta, tasks, agents, subtasks, agent_runs, reservations, task_events.
**v7 additions:** tasks.allowed_permissions JSON NOT NULL DEFAULT '[]'.
Full SQL: `docs/B0_v7_init.sql`

### 7.3 M0-A to v3 Migration
Pre-check: verify plan_steps exists, check no duplicate step_keys.
Within transaction: ALTER tasks (add allowed_permissions + budget columns), ALTER agents, CREATE subtasks, INSERT FROM plan_steps, ALTER agent_runs, CREATE reservations, CREATE task_events, UPDATE agent_runs.subtask_id, SET schema_version=3.
Post-check: executable validation queries (NOT comments).
Full SQL: `docs/B0_v7_migration_m0a.sql`

### 7.4 v1 to v3 Migration
v1 has _nexus_meta=1, tasks with plan_json, plan_steps, agent_runs.
Pre-check: verify _nexus_meta=1, check column existence (skip ALTERs for already-present columns).
Same structural changes as M0-A with existence guards.
Post-check: executable validation queries.
Full SQL: `docs/B0_v7_migration_v1.sql`

### 7.5 v2 to v3 Migration
v2 has subtasks but may lack reservations/task_events/agent permission_set/plan_version/is_active.
Pre-check: verify _nexus_meta=2, verify subtasks exists, detect missing columns.
Add missing tables and columns. Do NOT re-migrate plan_steps data.
Post-check: executable validation queries.
Full SQL: `docs/B0_v7_migration_v2.sql`

### 7.6 Migration Post-Check Execution (v7 Mandate)
Post-migration validation queries MUST be executable SQL, not comments. The migration runner must:
1. Execute each validation query
2. Assert expected results
3. Report failures with specific query and result
4. Never pass silently on validation failure

---

## 8. idempotency_key Lifecycle

- Set on POST /tasks (optional, max 100 chars).
- Stored in tasks.idempotency_key (UNIQUE where not null).
- Duplicate: return existing task (200). If existing is closed, return 409.
- After task reaches closed: idempotency_key still reserved (prevents accidental reuse).
- Explicitly clearing: not supported; new key must be used.

---

## 9. Replan: Cancelling In-Flight SubTasks + Late Result Isolation (v7)

When replan triggers:
1. Any SubTask with status=RUNNING/RETRYING: send cancel_event to agent.
2. Wait up to 30s for cancellation.
3. After cancel: release reservation for that attempt (or expire if uncertain).
4. Old SubTask status -> CANCELLED or SUPERSEDED (depending on plan_version).
5. BLOCKED SubTasks: if upstream cancelled, -> SKIPPED.
6. New plan SubTasks: fresh PENDING with plan_version+1.

**Late Result Isolation (v7 Dual Fencing):**
- Each plan_version and retry attempt creates SubTasks with unique `execution_id` values.
- When an agent returns an execution result, strict dual fencing is enforced before accepting state mutations:
  1. **Execution Attempt Fencing**: `incoming_execution_id == subtask.current_execution_id`. If they do not match (e.g. A timed-out prior attempt from the same plan_version finally returned), REJECT the result.
  2. **Plan Version Fencing**: `subtask.plan_version == current_active_plan_version` and `subtask.is_active == 1`. If `subtask.plan_version < current_active_plan_version` or `subtask.is_active == 0` (SUPERSEDED), REJECT the result.
- On rejection: log `late_result_rejected` TaskEvent, ignore proposed status/result mutations, release or expire any associated reservation.
- Dual fencing completely prevents stale or orphaned execution results from overwriting new plan states.

---

## 10. Module Boundaries (v7 Formal Adoption)

B0-B10 modules are formally adopted. B0 is implemented now (M0-B); B1-B10 are contract-defined with implementation deferred per M0-B scope.

### 10.1 Module Definitions
| Module | Responsibility | Input | Output | Depends On |
|--------|---------------|-------|--------|------------|
| B0 | Contracts, DDL, enums, Protocols | - | Interfaces | - |
| B1 Planner | Goal -> SubTask list | goal, context, budget | [SubTask] | B0 |
| B2 Scheduler | Wave scheduling, dispatch | [SubTask], registry | ExecutionResult | B0 |
| B3 Agent Registry | Agent CRUD, selection | selection criteria | AgentProtocol | B0 |
| B4 Adapter Layer | Agent protocol implementation | AgentProtocol | AgentResult | B0 |
| B5 Verifier | SubTask + Task verification | results, criteria | VerificationResult | B0 |
| B6 BudgetTracker | Reservation, settlement, budget enforcement | budget config | Reservation, RemainingBudget | B0 |
| B7 Persistence | DB access, migration, CRUD | model objects | persisted rows | B0 |
| B8 Event System | Event creation, dispatch, sequence allocation | state changes | TaskEvent | B0 |
| B9 Memory | Context retrieval | verified results | context dict | B0 |
| B10 Model Router | Model selection | budget, complexity | model_id | B0 |

### 10.2 Data Ownership
| Data Entity | Owning Module | Readers | Notes |
|------------|--------------|---------|-------|
| Reservation | B6 BudgetTracker | B2, B7 | Only B6 creates/commits/releases/expires reservations |
| Task | B7 Persistence | B0 (read), B1, B2, B5, B6, B8 | Only B7 writes Task rows; others read via PersistenceProtocol |
| SubTask | B7 Persistence | B0 (read), B1, B2, B5 | Only B7 writes SubTask rows |
| TaskEvent | B8 Event System | B7 (write), all (read) | B8 creates events, B7 persists them |
| Agent | B3 Agent Registry | B7 (write), B2 (read) | B3 manages agent lifecycle, B7 persists |

### 10.3 Database Write Restriction
**ONLY B7 Persistence module may execute DML (INSERT/UPDATE/DELETE) against the database.**
All other modules call PersistenceProtocol methods for state changes.
Exception: migration scripts (which ARE B7 responsibility).

### 10.4 Cross-Module Communication
- Modules communicate via injected Protocol interfaces or event subscriptions.
- No cross-module internal imports (e.g., `from b1.planner import ...` inside B2).
- Module dependencies flow: all modules depend on B0; B0 depends on nothing.
- B7 (Persistence) is a leaf dependency: all modules request persistence via B0.PersistenceProtocol.

### 10.5 Protocol Signatures (Key Interfaces)
```python
# B0 Protocols (defined in B0, implemented by respective modules)

class PersistenceProtocol:
    """B7 implements. Only module allowed to write to DB."""
    def create_task(self, task: Task) -> Task: ...
    def update_task_status(self, task_id: str, old_status: str, new_status: str) -> Task: ...
    def get_task(self, task_id: str) -> Task | None: ...
    def create_subtask(self, subtask: SubTask) -> SubTask: ...
    # Explicit domain actions replacing untyped update_subtask(updates: dict)
    def update_subtask_status(self, subtask_id: str, old_status: str, new_status: str, execution_error: str | None = None) -> SubTask: ...
    def update_subtask_execution(self, subtask_id: str, execution_id: str, attempt_count: int, started_at: str) -> SubTask: ...
    def record_subtask_result(self, subtask_id: str, result_summary: str | None, result_structured: dict | None, artifacts: list | None, token_input: int, token_output: int, token_usage_source: str, finished_at: str) -> SubTask: ...
    def record_subtask_verification(self, subtask_id: str, verification_status: str, verification_notes: str | None) -> SubTask: ...
    def supersede_subtasks(self, task_id: str, plan_version: int) -> int: ...
    def get_active_subtasks(self, task_id: str) -> list[SubTask]: ...

class BudgetProtocol:
    """B6 implements."""
    def reserve(self, task_id: str, tokens: int, calls: int, caller_id: str) -> Reservation: ...
    def commit(self, reservation_id: str, tokens_charged: int, calls_charged: int, usage_source: str) -> Reservation: ...
    def release(self, reservation_id: str) -> None: ...
    def remaining_budget(self, task_id: str) -> RemainingBudget: ...

class EventProtocol:
    """B8 implements."""
    def write_event(self, task_id: str, event_type: str, actor_type: str, **kwargs) -> TaskEvent: ...
```

### 10.6 Rules
- B1-B10 import ONLY from B0 interfaces.
- No cross-module internal imports.
- Cross-module communication via injected interfaces or event subscriptions.
- B0 contains Protocols, dataclasses, enums, DDL. NO business logic.

---

## 11. AgentRun Fingerprint: Request Consistency Determination (§11)

### 11.1 Fingerprint Computation
The request fingerprint serves as a deterministic hash for **Request Consistency Determination (请求一致性判定)** to detect execution replays and tampering:
```python
request_fingerprint = SHA256(canonical_json({
    "context": dict(context or {}),
    "goal": goal.strip(),
    "required_permissions": sorted(required_permissions or []),
    "role": str(role or ""),
}))
```
**Canonical JSON Specification (`canonical_json`):**
- Dictionary keys are sorted lexicographically at all nesting levels (`sort_keys=True`).
- Zero extraneous whitespace around delimiters: `separators=(',', ':')`.
- All string values and keys are normalized using Unicode NFC (`unicodedata.normalize('NFC', text)`).
- Serialized as exact UTF-8 byte stream (`ensure_ascii=False`).
- Eliminates delimiter ambiguity and guarantees cross-platform byte-for-byte determinism.

### 11.2 Replay Detection
On SubTask execution:
1. Compute `request_fingerprint` from current request using the authoritative B0 algorithm.
2. Query `agent_runs` for existing run with same `execution_id`.
3. If no existing run: proceed with execution, store fingerprint.
4. If existing run found:
   a. Compare stored `request_fingerprint` with current.
   b. **Match** → idempotent replay: return existing AgentRun result (no re-execution).
   c. **Mismatch** → `FingerprintConflictError`: either tampering (different payload with same `execution_id`) or payload divergence; log conflict event, refuse execution.
5. Store fingerprint on the AgentRun row on first execution.

### 11.3 Conflict Resolution
`FingerprintConflictError` is strictly enforced and NEVER silently swallowed:
- AgentRun status -> `'conflict'`
- TaskEvent with `event_type='fingerprint_conflict'`
- SubTask status -> `'failed'` with `error='Fingerprint conflict: execution_id replay with mismatched payload'`
- Dual Fencing & Replay isolation strictly protect system integrity against tampering.

---

## §A: Complete Budget Formulas

remaining_tokens = max_total_tokens
  - SUM(CASE WHEN status='COMMITTED' THEN tokens_charged ELSE 0 END)
  - SUM(CASE WHEN status='PENDING' THEN tokens_reserved ELSE 0 END)
  - SUM(CASE WHEN status='EXPIRED' THEN tokens_reserved ELSE 0 END)

remaining_calls = max_model_calls
  - same pattern with calls_charged/calls_reserved

RELEASED: excluded (tokens_charged=0, calls_charged=0).

## §B: P0/P1 Checklist (v7)

**P0:**
P0-1: Task aggregation — INCONCLUSIVE conflict resolved (§1.1 failed requires zero INCONCLUSIVE); 16-row table verified with Zero-PASSED column; §1.1 matches §1.4 matches tests
P0-2: Permission persistence — tasks.allowed_permissions JSON; fresh DDL + all 3 migration paths include it; permission check Protocol in §4.6; tests for all deny cases
P0-3: Migration scripts — M0-A/v1/v2 → v3; each with pre-check, column-existence check, data mapping, transaction rollback, executable post-check, 0% schema drift
P0-4: Module boundaries — B0-B10 formally adopted; data ownership table §10.2; DB write restriction §10.3; explicit domain actions for SubTask; cross-module rules §10.4; protocol signatures §10.5
P0-5: Budget — all fields persisted on tasks; immutable after running; single BudgetTracker source
P0-6: max_steps/max_agents cumulative across plan versions (§5.1)

**P1:**
P1-1: Event BEGIN IMMEDIATE + SQLITE_BUSY handling with 5-retry exponential backoff (§6.1)
P1-2: Unknown Usage complete settlement flow with recalculated remaining budget (§5.5)
P1-3: Fingerprint replay matching with SHA256 + canonical JSON NFC + conflict detection + error handling (§11)
P1-4: Replan dual fencing isolation via execution_id + current_execution_id + plan_version gate (§9)
P1-5: Migration post-checks executable SQL and asserted in Python runner, not comments (§7.6)
P1-6: Budget immutability enforcement after task enters 'running' (§5.1)
P1-7: RELEASED excluded, EXPIRED counted, overrun allowed with budget_exhausted trigger (§5.3-5.4)

## §C: Unresolved Issues
- B1-B10 implementation is deferred; protocol definitions in §10.5 are contracts, not tested implementations
- Cumulative max_steps/max_agents semantics may need refinement when B1 Planner generates variable-sized plans across replans
- Budget immutability enforcement at Persistence layer is a contract; implementation deferred to B7 Persistence Module
- Concurrent event write with BEGIN IMMEDIATE tested via SQLite locking; production PostgreSQL/MySQL equivalents need separate protocol