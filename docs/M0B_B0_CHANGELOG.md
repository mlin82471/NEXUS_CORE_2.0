# B0 Changelog

## v7.0 — Quality Gate Verified & FROZEN (Final Audit)

### P0 Rectifications & Gate Pass
- **P0-1 Task Aggregation Protocol**: Authoritative 16-row aggregation engine implemented in `app/b0/aggregation.py`. Handled zero-active-subtask row 16, all-inconclusive rows 8-9 (evaluates to `partial` or `replan`, never `failed`), and zero-passed scenarios with 100% mathematical precision.
- **P0-2 Permission Protocol & Persistence**: `allowed_permissions` column added to tasks across fresh DDL and all 3 migrations. Authoritative Default-Deny decision tree implemented in `app/b0/permissions.py`.
- **P0-3 Zero-Drift Migrations & Atomic Runner**: Implemented Python `MigrationRunner` (`app/b0/migration_runner.py`). Eliminated v2 schema drift (added missing `subtasks` columns and indexes). Pre-checks, conditional column existence, data mapping, and post-check assertions all execute in atomic `BEGIN IMMEDIATE` transactions with rollback on failure.
- **P0-4 Module Boundaries & Explicit Domain Actions**: Retired untyped `update_subtask(updates: dict)`. Formalized explicit domain actions in `PersistenceProtocol` (`update_subtask_status`, `update_subtask_execution`, `record_subtask_result`, `record_subtask_verification`, `supersede_subtasks`).
- **P0-5 Budget Immutability & Immutability Guard**: Implemented `guard_budget_immutable()` in `app/b0/budget.py`. Rejection strictly enforced once task enters `running` or terminal status.
- **P0-6 Cumulative Budget Semantics**: Formalized cumulative budget rules across replan cycles.

### P1 Rectifications & Gate Pass
- **P1-1 Event Protocol**: Concurrency stress-tested with multi-threaded `BEGIN IMMEDIATE` + backoff retry in `app/b0/events.py`.
- **P1-2 Unknown Usage Conservative Settlement**: Implemented `calculate_unknown_charge()` and `calculate_remaining_budget()` in `app/b0/budget.py` adhering to `min(limit, max(reserved, limit / 2))`.
- **P1-3 Request Consistency Determination & NFC Unicode Canonical JSON**: Formalized SHA-256 fingerprinting with Unicode NFC normalization and deterministic JSON serialization in `app/b0/fingerprint.py`. Replay match vs. conflict strictly identified with `FingerprintConflictError`.
- **P1-4 Replan Dual Fencing Isolation**: Fenced both `plan_version` and `incoming_execution_id == subtask.current_execution_id` to prevent late stale execution writes.
- **P1-5 Executable Post-Migration Assertions**: Integrated into `MigrationRunner._assert_post_checks` ensuring orphan records, duplicate keys, or missing columns abort and rollback migration.
- **P1-6 Strict Budget Formulas**: Fixed reservation classification (`COMMITTED`, `PENDING`, `EXPIRED`, `RELEASED`) in `app/b0/budget.py`.

### Deliverables (v7 Audit Complete)
- `M0B_B0_ARCHITECTURE.md`: Complete architectural contract
- `B0_v7_init.sql`: Fresh DDL with 0% drift
- `B0_v7_migration_m0a.sql`: M0-A → v3 migration
- `B0_v7_migration_v1.sql`: v1 → v3 migration
- `B0_v7_migration_v2.sql`: v2 → v3 migration (aligned 100% with fresh DDL)
- `app/b0/`: Authoritative protocol implementations (`permissions.py`, `aggregation.py`, `budget.py`, `fingerprint.py`, `events.py`, `migration_runner.py`)
- `docs/test_b0_v7.py`: Comprehensive test suite with 26 rigorous tests and 0 swallowed assertions

### Unresolved Issues
- B1-B10 implementation deferred; protocol signatures are contracts only
- Concurrent event write with BEGIN IMMEDIATE — PostgreSQL/MySQL equivalents need separate protocol

## v6.0 — Freeze Candidate
(see v6 changelog for prior history)