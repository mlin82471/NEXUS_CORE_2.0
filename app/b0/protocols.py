"""
NEXUS CORE 2.0 — B0 Data Types and Protocols (§10.5)
Pure contract specifications for B1-B10 module interactions.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping, Protocol, Sequence, runtime_checkable

# ---------------------------------------------------------------------------
# Data Models / Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class TaskData:
    id: str
    goal: str
    status: str = "queued"
    risk_suggestion: str | None = None
    risk_level: str | None = None
    approval_status: str = "none"
    replan_count: int = 0
    verifier_result: dict | None = None
    closed_at: str | None = None
    idempotency_key: str | None = None
    # Budget columns
    max_total_tokens: int = 200000
    max_model_calls: int = 20
    max_steps: int = 10
    max_agents: int = 5
    max_parallel: int = 3
    max_replans: int = 2
    subtask_token_limit: int = 50000
    subtask_retry_limit: int = 2
    # Permissions
    allowed_permissions: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str | None = None


@dataclass
class SubTaskData:
    id: str
    task_id: str
    step_key: str
    goal: str
    role: str
    plan_version: int = 0
    is_active: int = 1
    legacy_planstep_id: str | None = None
    parent_step_key: str | None = None
    required_permissions: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    max_retries: int = 2
    token_limit: int | None = None
    status: str = "pending"
    assigned_agent_id: str | None = None
    result_summary: str | None = None
    result_structured: dict | None = None
    artifacts: list | None = None
    verification_status: str = "pending"
    verification_notes: str | None = None
    execution_error: str | None = None
    token_input: int = 0
    token_output: int = 0
    token_usage_source: str = "unknown"
    attempt_count: int = 0
    execution_id: str | None = None
    request_fingerprint: str | None = None
    step_order: int = 0
    created_at: str = ""
    started_at: str | None = None
    finished_at: str | None = None


@dataclass
class AgentData:
    id: str
    name: str
    role: str
    adapter_type: str
    enabled: bool = True
    capabilities: list[str] = field(default_factory=list)
    permission_set: list[str] = field(default_factory=list)
    verification_status: str = "declared"
    verified_at: str | None = None
    created_at: str = ""


@dataclass
class AgentRunData:
    id: str
    task_id: str
    agent_id: str | None
    subtask_id: str | None
    execution_id: str | None
    request_fingerprint: str | None
    status: str = "pending"
    result: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    usage_source: str = "unknown"
    confidence: float | None = None
    verification_passed: int | None = None
    created_at: str = ""
    finished_at: str | None = None


@dataclass
class ReservationData:
    reservation_id: str
    task_id: str
    caller_id: str
    tokens_reserved: int
    calls_reserved: int
    status: str = "PENDING"
    subtask_id: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    tokens_charged: int | None = None
    calls_charged: int | None = None
    usage_source: str | None = None
    settle_fingerprint: str | None = None
    created_at: str = ""
    resolved_at: str | None = None


@dataclass
class TaskEventData:
    event_id: str
    task_id: str
    sequence: int
    event_type: str
    actor_type: str
    actor_id: str | None = None
    subtask_id: str | None = None
    payload: dict = field(default_factory=dict)
    schema_version: int = 1
    timestamp: str = ""


@dataclass
class RemainingBudgetData:
    remaining_tokens: int
    remaining_calls: int
    consumed_tokens: int
    consumed_calls: int
    is_exhausted: bool


# ---------------------------------------------------------------------------
# Protocols (§10.5)
# ---------------------------------------------------------------------------

@runtime_checkable
class PersistenceProtocol(Protocol):
    """B7 Persistence Protocol: The ONLY interface allowed to perform DB writes."""

    def create_task(self, task: TaskData) -> TaskData:
        ...

    def update_task_status(self, task_id: str, old_status: str, new_status: str) -> TaskData:
        ...

    def get_task(self, task_id: str) -> TaskData | None:
        ...

    def get_task_by_idempotency_key(self, key: str) -> TaskData | None:
        ...

    def create_subtask(self, subtask: SubTaskData) -> SubTaskData:
        ...

    def update_subtask_status(
        self, subtask_id: str, old_status: str, new_status: str, execution_error: str | None = None
    ) -> SubTaskData:
        ...

    def update_subtask_execution(
        self, subtask_id: str, execution_id: str, attempt_count: int, started_at: str
    ) -> SubTaskData:
        ...

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
        ...

    def record_subtask_verification(
        self, subtask_id: str, verification_status: str, verification_notes: str | None
    ) -> SubTaskData:
        ...

    def supersede_subtasks(self, task_id: str, plan_version: int) -> int:
        ...

    def get_active_subtasks(self, task_id: str) -> list[SubTaskData]:
        ...

    def get_subtask(self, subtask_id: str) -> SubTaskData | None:
        ...

    def create_agent_run(self, agent_run: AgentRunData) -> AgentRunData:
        ...

    def get_agent_run_by_execution_id(self, execution_id: str) -> AgentRunData | None:
        ...

    def get_agent(self, agent_id: str) -> AgentData | None:
        ...

    def list_agents(self, role: str | None = None, enabled_only: bool = True) -> list[AgentData]:
        ...


@runtime_checkable
class BudgetProtocol(Protocol):
    """B6 BudgetTracker Protocol."""

    def reserve(
        self, task_id: str, tokens: int, calls: int, caller_id: str, subtask_id: str | None = None
    ) -> ReservationData:
        ...

    def commit(
        self, reservation_id: str, tokens_charged: int, calls_charged: int, usage_source: str
    ) -> ReservationData:
        ...

    def release(self, reservation_id: str) -> None:
        ...

    def expire(self, reservation_id: str) -> None:
        ...

    def remaining_budget(self, task_id: str) -> RemainingBudgetData:
        ...


@runtime_checkable
class EventProtocol(Protocol):
    """B8 Event System Protocol."""

    def write_event(
        self,
        task_id: str,
        event_type: str,
        actor_type: str,
        actor_id: str | None = None,
        subtask_id: str | None = None,
        payload: dict | None = None,
    ) -> TaskEventData:
        ...
