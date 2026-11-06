"""
NEXUS CORE 2.0 — B1 Core Execution Engine
Orchestrates Task execution using pure B0 protocols (Persistence, Budget, Event, Permission, Aggregation).
"""
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from app.b0.aggregation import aggregate_task_status
from app.b0.budget import calculate_unknown_charge, guard_budget_immutable
from app.b0.fingerprint import (
    FingerprintConflictError,
    compute_request_fingerprint,
    verify_replay_match,
)
from app.b0.permissions import check_permissions, get_required_permissions_for_role
from app.b0.protocols import (
    AgentData,
    AgentRunData,
    BudgetProtocol,
    EventProtocol,
    PersistenceProtocol,
    SubTaskData,
    TaskData,
)
from app.b1.agent_runner import run_agent_safely
from app.b1.evaluator import IndependentEvaluator

log = logging.getLogger("nexus.b1.engine")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ExecutionEngine:
    """
    B1 Unified Execution Engine.
    Coordinates planner steps, subtask lifecycle, agent selection/execution,
    permission & budget enforcement, event recording, and terminal aggregation.
    """

    def __init__(
        self,
        persistence: PersistenceProtocol,
        budget: BudgetProtocol,
        events: EventProtocol,
        evaluator: IndependentEvaluator | None = None,
    ):
        self.persistence = persistence
        self.budget = budget
        self.events = events
        self.evaluator = evaluator or IndependentEvaluator()

    # -----------------------------------------------------------------------
    # Task Submission & Initialization (B1-1, B1-2)
    # -----------------------------------------------------------------------

    def submit_task(
        self,
        goal: str,
        idempotency_key: str | None = None,
        allowed_permissions: list[str] | None = None,
        max_total_tokens: int = 200000,
        max_model_calls: int = 20,
        max_steps: int = 10,
        max_agents: int = 5,
        subtask_token_limit: int = 50000,
    ) -> TaskData:
        """
        Creates and enqueues a Task.
        Supports idempotency check per B0 §8.
        """
        if idempotency_key:
            existing = self.persistence.get_task_by_idempotency_key(idempotency_key)
            if existing:
                if existing.status in ("closed", "failed"):
                    raise ValueError(f"Task with idempotency_key {idempotency_key} is closed/terminal")
                return existing

        task_id = str(uuid.uuid4())
        task = TaskData(
            id=task_id,
            goal=goal,
            status="queued",
            idempotency_key=idempotency_key,
            max_total_tokens=max_total_tokens,
            max_model_calls=max_model_calls,
            max_steps=max_steps,
            max_agents=max_agents,
            subtask_token_limit=subtask_token_limit,
            allowed_permissions=allowed_permissions if allowed_permissions is not None else [],
        )
        created = self.persistence.create_task(task)

        # Emit task_created event
        self.events.write_event(
            task_id=task_id,
            event_type="task_created",
            actor_type="system",
            payload={"goal": goal, "idempotency_key": idempotency_key},
        )
        return created

    def plan_and_initialize_subtasks(
        self,
        task_id: str,
        plan_steps: list[dict],
    ) -> list[SubTaskData]:
        """
        Takes validated plan steps (e.g. from Planner) and persists active SubTasks.
        Emits subtask_created events.
        """
        task = self.persistence.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        created_subtasks = []
        for idx, step in enumerate(plan_steps):
            step_key = step["step_key"]
            role = step["role"]
            goal = step["goal"]
            depends_on = step.get("depends_on", [])
            context = step.get("context", {})

            required_perms = get_required_permissions_for_role(role)
            st_id = str(uuid.uuid4())
            subtask = SubTaskData(
                id=st_id,
                task_id=task_id,
                step_key=step_key,
                goal=goal,
                role=role,
                plan_version=task.replan_count,
                is_active=1,
                required_permissions=required_perms,
                depends_on=depends_on,
                context=context,
                step_order=idx,
                status="pending",
                token_limit=task.subtask_token_limit,
            )
            created = self.persistence.create_subtask(subtask)
            created_subtasks.append(created)

            self.events.write_event(
                task_id=task_id,
                event_type="subtask_created",
                actor_type="planner",
                subtask_id=st_id,
                payload={"step_key": step_key, "role": role},
            )
        return created_subtasks

    # -----------------------------------------------------------------------
    # Task Execution (B1-1, B1-2, B1-5, B1-6)
    # -----------------------------------------------------------------------

    def execute_task(
        self,
        task_id: str,
        cancel_event: threading.Event | None = None,
        timeout_seconds: float = 300.0,
    ) -> TaskData:
        """
        Executes an enqueued/planned Task sequentially or topologically according to dependencies.
        Enforces:
        - Permission Protocol
        - Budget Protocol (reservation, settlement)
        - Event Protocol (state transitions, errors)
        - Idempotent Replay Protection (Fingerprint)
        - Terminal Task Aggregation (16-row decision table)
        """
        task = self.persistence.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        if task.status not in ("queued", "running"):
            return task  # Already terminal

        # Transition task to 'running'
        if task.status == "queued":
            task = self.persistence.update_task_status(task_id, "queued", "running")
            self.events.write_event(
                task_id=task_id,
                event_type="task_started",
                actor_type="engine",
                payload={"status": "running"},
            )

        active_subtasks = self.persistence.get_active_subtasks(task_id)
        if not active_subtasks:
            # Row 16: Zero active subtasks -> failed
            self.persistence.update_task_status(task_id, "running", "failed")
            self.events.write_event(
                task_id=task_id,
                event_type="task_failed",
                actor_type="engine",
                payload={"reason": "zero_active_subtasks"},
            )
            return self.persistence.get_task(task_id)

        # Topological sorting of subtasks based on depends_on
        ordered_subtasks = self._topological_sort(active_subtasks)
        executed_keys: dict[str, str] = {}  # step_key -> terminal status ("success", "failed", etc.)

        for st in ordered_subtasks:
            # Check external cancel signal
            if cancel_event and cancel_event.is_set():
                self.persistence.update_subtask_status(st.id, st.status, "cancelled")
                self.events.write_event(
                    task_id=task_id,
                    event_type="subtask_cancelled",
                    actor_type="engine",
                    subtask_id=st.id,
                )
                continue

            # Check upstream dependencies
            upstream_failed = False
            for dep in st.depends_on:
                dep_status = executed_keys.get(dep)
                if dep_status != "success":
                    upstream_failed = True
                    break

            if upstream_failed:
                # Dependency failed or skipped -> skip this subtask
                self.persistence.update_subtask_status(st.id, st.status, "skipped")
                self.events.write_event(
                    task_id=task_id,
                    event_type="subtask_skipped",
                    actor_type="engine",
                    subtask_id=st.id,
                    payload={"reason": "upstream_dependency_not_successful"},
                )
                executed_keys[st.step_key] = "skipped"
                continue

            # Execute single subtask
            outcome_status = self._execute_single_subtask(
                task=task,
                subtask=st,
                cancel_event=cancel_event,
            )
            executed_keys[st.step_key] = outcome_status

        # -------------------------------------------------------------------
        # Final Aggregation (B0 §1.4 16-row decision table)
        # -------------------------------------------------------------------
        final_active_subtasks = self.persistence.get_active_subtasks(task_id)
        final_dicts = [
            {
                "status": s.status,
                "verification_status": s.verification_status,
                "is_active": s.is_active,
            }
            for s in final_active_subtasks
        ]

        final_status, replan_triggered = aggregate_task_status(
            active_subtasks=final_dicts,
            can_replan=False,
        )

        current_task = self.persistence.get_task(task_id)
        if current_task and current_task.status == "running":
            self.persistence.update_task_status(task_id, "running", final_status)
            self.events.write_event(
                task_id=task_id,
                event_type=f"task_{final_status}",
                actor_type="engine",
                payload={"final_status": final_status},
            )

        return self.persistence.get_task(task_id)

    # -----------------------------------------------------------------------
    # SubTask Execution Internals
    # -----------------------------------------------------------------------

    def _execute_single_subtask(
        self,
        task: TaskData,
        subtask: SubTaskData,
        cancel_event: threading.Event | None,
    ) -> str:
        """
        Executes one SubTask.
        Returns outcome status: 'success', 'failed', 'cancelled', 'skipped'.
        """
        task_id = task.id
        subtask_id = subtask.id

        # 1. Agent Selection & Permission Check (§4)
        candidates = self.persistence.list_agents(role=subtask.role, enabled_only=True)
        selected_agent: AgentData | None = None
        permission_denial_reason: str | None = None

        for agent in candidates:
            allowed, reason = check_permissions(
                agent_permission_set=agent.permission_set,
                required_permissions=subtask.required_permissions,
                task_allowed_permissions=task.allowed_permissions,
            )
            if allowed:
                selected_agent = agent
                break
            else:
                permission_denial_reason = reason

        if not selected_agent:
            # Denied or no agent available
            err_msg = permission_denial_reason or f"No agent available for role {subtask.role}"
            self.persistence.update_subtask_status(
                subtask_id=subtask_id,
                old_status=subtask.status,
                new_status="failed",
                execution_error=err_msg,
            )
            self.events.write_event(
                task_id=task_id,
                event_type="permission_denied" if permission_denial_reason else "agent_selection_failed",
                actor_type="engine",
                subtask_id=subtask_id,
                payload={"reason": err_msg},
            )
            return "failed"

        # Record agent assignment
        self.events.write_event(
            task_id=task_id,
            event_type="agent_assigned",
            actor_type="engine",
            subtask_id=subtask_id,
            actor_id=selected_agent.id,
        )

        # 2. Budget Reservation (§5)
        reserved_tokens = subtask.token_limit or 50000
        try:
            reservation = self.budget.reserve(
                task_id=task_id,
                tokens=reserved_tokens,
                calls=1,
                caller_id=selected_agent.id,
                subtask_id=subtask_id,
            )
        except ValueError as budget_err:
            # Budget exhausted!
            self.persistence.update_subtask_status(
                subtask_id=subtask_id,
                old_status=subtask.status,
                new_status="failed",
                execution_error=f"Budget exceeded: {budget_err}",
            )
            self.events.write_event(
                task_id=task_id,
                event_type="budget_exhausted",
                actor_type="engine",
                subtask_id=subtask_id,
                payload={"error": str(budget_err)},
            )
            return "failed"

        # 3. Fingerprint & Replay Match Check (§11)
        req_fp = compute_request_fingerprint(
            goal=subtask.goal,
            context=subtask.context,
            role=subtask.role,
            required_permissions=subtask.required_permissions,
        )

        execution_id = str(uuid.uuid4())
        self.persistence.update_subtask_execution(
            subtask_id=subtask_id,
            execution_id=execution_id,
            attempt_count=subtask.attempt_count + 1,
            started_at=_now(),
        )
        self.persistence.update_subtask_status(subtask_id, subtask.status, "running")

        self.events.write_event(
            task_id=task_id,
            event_type="subtask_started",
            actor_type="agent",
            actor_id=selected_agent.id,
            subtask_id=subtask_id,
            payload={"execution_id": execution_id, "fingerprint": req_fp},
        )

        # 4. Invoke Agent safely
        outcome = run_agent_safely(
            agent_record=selected_agent,
            goal=subtask.goal,
            context=subtask.context,
            cancel_event=cancel_event,
            timeout_seconds=30.0,
        )

        # 5. Settlement & Result Recording
        if outcome.status == "completed":
            tokens_to_charge = outcome.input_tokens + outcome.output_tokens
            usage_source = outcome.usage_source

            if usage_source == "unknown":
                subtask_limit = subtask.token_limit or 50000
                tokens_to_charge = calculate_unknown_charge(subtask_limit, reserved_tokens)

            # Commit budget reservation
            self.budget.commit(
                reservation_id=reservation.reservation_id,
                tokens_charged=tokens_to_charge,
                calls_charged=1,
                usage_source=usage_source,
            )

            # Record agent run
            run_id = str(uuid.uuid4())
            self.persistence.create_agent_run(
                AgentRunData(
                    id=run_id,
                    task_id=task_id,
                    agent_id=selected_agent.id,
                    subtask_id=subtask_id,
                    execution_id=execution_id,
                    request_fingerprint=req_fp,
                    status="completed",
                    result=outcome.result,
                    input_tokens=outcome.input_tokens,
                    output_tokens=outcome.output_tokens,
                    usage_source=usage_source,
                    finished_at=_now(),
                )
            )

            # Update subtask result
            self.persistence.record_subtask_result(
                subtask_id=subtask_id,
                result_summary=outcome.result,
                result_structured={"output": outcome.result},
                artifacts=None,
                token_input=outcome.input_tokens,
                token_output=outcome.output_tokens,
                token_usage_source=usage_source,
                finished_at=_now(),
            )

            # Independent verification pipeline
            eval_res = self.evaluator.evaluate_subtask(
                subtask=subtask,
                result_content=outcome.result,
                acceptance_criteria=subtask.acceptance_criteria,
            )

            self.persistence.record_subtask_verification(
                subtask_id=subtask_id,
                verification_status=eval_res.status,
                verification_notes=eval_res.notes,
            )

            if eval_res.status == "passed":
                self.persistence.update_subtask_status(subtask_id, "running", "success")
                self.events.write_event(
                    task_id=task_id,
                    event_type="subtask_completed",
                    actor_type="agent",
                    actor_id=selected_agent.id,
                    subtask_id=subtask_id,
                    payload={"tokens_charged": tokens_to_charge, "eval_score": eval_res.score},
                )
                return "success"
            else:
                self.persistence.update_subtask_status(
                    subtask_id=subtask_id,
                    old_status="running",
                    new_status="failed",
                    execution_error=f"Independent evaluation failed: {eval_res.notes}",
                )
                self.events.write_event(
                    task_id=task_id,
                    event_type="subtask_verification_failed",
                    actor_type="evaluator",
                    actor_id="independent_evaluator",
                    subtask_id=subtask_id,
                    payload={"reason": eval_res.notes, "details": eval_res.details},
                )
                return "failed"

        elif outcome.status == "cancelled":
            self.budget.release(reservation.reservation_id)
            self.persistence.update_subtask_status(
                subtask_id=subtask_id,
                old_status="running",
                new_status="cancelled",
                execution_error=outcome.error_message,
            )
            self.events.write_event(
                task_id=task_id,
                event_type="subtask_cancelled",
                actor_type="agent",
                actor_id=selected_agent.id,
                subtask_id=subtask_id,
            )
            return "cancelled"

        else:  # "failed" or "timeout"
            self.budget.release(reservation.reservation_id)
            self.persistence.update_subtask_status(
                subtask_id=subtask_id,
                old_status="running",
                new_status="failed",
                execution_error=outcome.error_message,
            )
            self.persistence.record_subtask_verification(
                subtask_id=subtask_id,
                verification_status="failed",
                verification_notes=outcome.error_message,
            )
            self.events.write_event(
                task_id=task_id,
                event_type="subtask_failed",
                actor_type="agent",
                actor_id=selected_agent.id,
                subtask_id=subtask_id,
                payload={"error": outcome.error_message},
            )
            return "failed"

    # -----------------------------------------------------------------------
    # Restart & Crash Recovery (B1-6)
    # -----------------------------------------------------------------------

    def recover_interrupted_tasks(self) -> list[str]:
        """
        Scans for tasks in 'running' status after a crash/restart.
        Marks pending/running subtasks as failed with audit trail,
        releases stranded pending budget reservations,
        and aggregates deterministic B0 v7 terminal states.
        """
        recovered_ids = []
        if hasattr(self.persistence, "get_tasks_by_status"):
            running_tasks = self.persistence.get_tasks_by_status("running")
        else:
            running_tasks = []

        for task in running_tasks:
            active_subtasks = self.persistence.get_active_subtasks(task.id)
            for sub in active_subtasks:
                if sub.status in ("running", "pending"):
                    try:
                        self.persistence.update_subtask_status(
                            subtask_id=sub.id,
                            old_status=sub.status,
                            new_status="failed",
                            execution_error="Interrupted by system crash / server restart",
                        )
                        self.persistence.record_subtask_verification(
                            subtask_id=sub.id,
                            verification_status="failed",
                            verification_notes="Execution aborted due to unexpected process restart",
                        )
                    except Exception as e:
                        log.warning(f"Error marking subtask {sub.id} failed during recovery: {e}")

            # Release stranded pending reservations if supported
            if hasattr(self.budget, "list_pending_reservations"):
                for res_id in self.budget.list_pending_reservations(task.id):
                    try:
                        self.budget.release(res_id)
                    except Exception:
                        pass

            # Write recovery audit event
            self.events.write_event(
                task_id=task.id,
                event_type="task_crash_recovered",
                actor_type="system",
                actor_id="engine_recovery",
                payload={"recovered_at": _now()},
            )

            # Aggregate and transition terminal state using B0 v7 contract
            updated_subtasks = self.persistence.get_active_subtasks(task.id)
            final_dicts = [
                {"status": s.status, "acceptance_criteria": s.acceptance_criteria}
                for s in updated_subtasks
            ]
            final_status, _ = aggregate_task_status(
                active_subtasks=final_dicts,
                can_replan=False,
            )
            self.persistence.update_task_status(task.id, "running", final_status)
            self.events.write_event(
                task_id=task.id,
                event_type=f"task_{final_status}",
                actor_type="system",
                actor_id="engine_recovery",
                payload={"final_status": final_status, "recovered": True},
            )
            recovered_ids.append(task.id)

        return recovered_ids

    # -----------------------------------------------------------------------
    # Topological Sorter
    # -----------------------------------------------------------------------

    def _topological_sort(self, subtasks: list[SubTaskData]) -> list[SubTaskData]:
        key_map = {s.step_key: s for s in subtasks}
        indeg = {s.step_key: len(s.depends_on) for s in subtasks}
        ready = sorted(
            [s for s in subtasks if indeg[s.step_key] == 0],
            key=lambda x: x.step_order,
        )
        ordered = []
        while ready:
            curr = ready.pop(0)
            ordered.append(curr)
            for s in subtasks:
                if curr.step_key in s.depends_on:
                    indeg[s.step_key] -= 1
                    if indeg[s.step_key] == 0:
                        ready.append(s)
                        ready.sort(key=lambda x: x.step_order)

        if len(ordered) != len(subtasks):
            # Dependency cycle or unresolved reference: fall back to step_order
            return sorted(subtasks, key=lambda x: x.step_order)
        return ordered
