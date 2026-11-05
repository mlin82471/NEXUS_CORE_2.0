"""
NEXUS CORE 2.0 — B0 Pure Contract and Protocol Layer
Implements B0 architecture contracts without touching legacy M0-A runtime code.
"""

from app.b0.permissions import (
    ROLES,
    ROLE_TO_PERMISSIONS,
    check_permissions,
    get_required_permissions_for_role,
)
from app.b0.aggregation import (
    aggregate_task_status,
)
from app.b0.budget import (
    calculate_unknown_charge,
    calculate_remaining_budget,
    guard_budget_immutable,
    BudgetImmutableError,
)
from app.b0.fingerprint import (
    canonical_json,
    compute_request_fingerprint,
    verify_replay_match,
    FingerprintConflictError,
)
from app.b0.events import (
    write_event,
    EventSequenceConflictError,
    EventWriteError,
)
from app.b0.migration_runner import (
    MigrationRunner,
    MigrationError,
)
from app.b0.protocols import (
    TaskData,
    SubTaskData,
    AgentData,
    AgentRunData,
    ReservationData,
    TaskEventData,
    RemainingBudgetData,
    PersistenceProtocol,
    BudgetProtocol,
    EventProtocol,
)

__all__ = [
    "ROLES",
    "ROLE_TO_PERMISSIONS",
    "check_permissions",
    "get_required_permissions_for_role",
    "aggregate_task_status",
    "calculate_unknown_charge",
    "calculate_remaining_budget",
    "guard_budget_immutable",
    "BudgetImmutableError",
    "canonical_json",
    "compute_request_fingerprint",
    "verify_replay_match",
    "FingerprintConflictError",
    "write_event",
    "EventSequenceConflictError",
    "EventWriteError",
    "MigrationRunner",
    "MigrationError",
    "TaskData",
    "SubTaskData",
    "AgentData",
    "AgentRunData",
    "ReservationData",
    "TaskEventData",
    "RemainingBudgetData",
    "PersistenceProtocol",
    "BudgetProtocol",
    "EventProtocol",
]
