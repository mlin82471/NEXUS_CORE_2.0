"""
NEXUS CORE 2.0 — B0 Budget and Reservation Protocol (§5, §A)
"""
from typing import Any, Mapping, Sequence

class BudgetImmutableError(Exception):
    """Raised when an update attempts to modify TaskBudget after task has started."""
    pass

BUDGET_FIELDS = {
    "max_total_tokens",
    "max_model_calls",
    "max_steps",
    "max_agents",
    "max_parallel",
    "max_replans",
    "subtask_token_limit",
    "subtask_retry_limit",
}

RUNNING_OR_TERMINAL_STATUSES = {
    "running",
    "success",
    "partial",
    "failed",
    "cancelled",
    "closed",
}

def calculate_unknown_charge(subtask_token_limit: int, reserved_tokens: int) -> int:
    """Conservative settlement formula for unknown usage per §5.5.
    unknown_charge = min(subtask_token_limit, max(reserved_tokens, subtask_token_limit / 2))
    """
    half_limit = subtask_token_limit // 2
    return min(subtask_token_limit, max(reserved_tokens, half_limit))

def calculate_remaining_budget(
    max_total_tokens: int,
    max_model_calls: int,
    reservations: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Calculate remaining budget per §5.4 and §A.
    
    COMMITTED: tokens_charged / calls_charged (actual, may exceed reserved)
    PENDING:   tokens_reserved / calls_reserved (conservative)
    EXPIRED:   tokens_reserved / calls_reserved (conservative)
    RELEASED:  excluded (tokens_charged=0, calls_charged=0)
    """
    committed_tokens = 0
    committed_calls = 0
    pending_tokens = 0
    pending_calls = 0
    expired_tokens = 0
    expired_calls = 0

    for r in reservations:
        status = str(r.get("status", "")).upper()
        if status == "COMMITTED":
            committed_tokens += int(r.get("tokens_charged") or 0)
            committed_calls += int(r.get("calls_charged") or 0)
        elif status == "PENDING":
            pending_tokens += int(r.get("tokens_reserved") or 0)
            pending_calls += int(r.get("calls_reserved") or 0)
        elif status == "EXPIRED":
            expired_tokens += int(r.get("tokens_reserved") or 0)
            expired_calls += int(r.get("calls_reserved") or 0)
        elif status == "RELEASED":
            # Excluded entirely
            continue

    consumed_tokens = committed_tokens + pending_tokens + expired_tokens
    consumed_calls = committed_calls + pending_calls + expired_calls

    remaining_tokens = max_total_tokens - consumed_tokens
    remaining_calls = max_model_calls - consumed_calls

    return {
        "remaining_tokens": remaining_tokens,
        "remaining_calls": remaining_calls,
        "consumed_tokens": consumed_tokens,
        "consumed_calls": consumed_calls,
        "is_exhausted": remaining_tokens < 0 or remaining_calls < 0,
    }

def guard_budget_immutable(current_status: str, proposed_updates: Mapping[str, Any]) -> None:
    """Enforce budget immutability after task enters 'running' state per §5.1."""
    if str(current_status).lower() in RUNNING_OR_TERMINAL_STATUSES:
        attempted_budget_mutations = [k for k in proposed_updates if k in BUDGET_FIELDS]
        if attempted_budget_mutations:
            raise BudgetImmutableError(
                f"Task budget is immutable after entering '{current_status}'. "
                f"Cannot modify: {attempted_budget_mutations}"
            )
