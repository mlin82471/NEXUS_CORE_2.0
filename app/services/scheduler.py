"""
M0-A Scheduler: DAG topological execution, atomic CAS, exception-safe.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Task, PlanStep, AgentRun, TaskEvent
from app.agents.base import AgentResult
from app.services.registry import pick_agent, dispatch_agent
from app.schemas import ROLES
from app.b0.aggregation import aggregate_task_status
from app.b0.budget import guard_budget_immutable
from app.b0.permissions import check_permissions, get_required_permissions_for_role

NL = chr(10)

def _now():
    return datetime.now(timezone.utc)


def _add_event(db: Session, task_id: str, etype: str, msg: str = "", payload: dict = None):
    db.add(TaskEvent(task_id=task_id, event_type=etype, message=msg, payload=payload or {}))
    db.commit()
    try:
        from app.services.worker_pool import broadcast_task_event
        broadcast_task_event(task_id, etype, {"message": msg, "payload": payload or {}})
    except Exception:
        pass



def _validate_agent_result(output) -> str:
    """Validate AgentResult. Returns "ok" or an error description."""
    if output is None:
        return "Agent returned None"
    if not isinstance(output, AgentResult):
        return f"Agent returned {type(output).__name__}, expected AgentResult"
    if not hasattr(output, "result") or not isinstance(output.result, str):
        return "AgentResult.result missing or wrong type"
    if not output.result or not output.result.strip():
        return "AgentResult.result is empty"
    if not isinstance(getattr(output, "input_tokens", None), int) or output.input_tokens < 0:
        return f"AgentResult.input_tokens invalid: {getattr(output, 'input_tokens', None)}"
    if not isinstance(getattr(output, "output_tokens", None), int) or output.output_tokens < 0:
        return f"AgentResult.output_tokens invalid: {getattr(output, 'output_tokens', None)}"
    if getattr(output, "usage_source", "") == "error":
        return "Agent returned usage_source=error"
    return "ok"


def _topological_order(steps: list[PlanStep]) -> list[PlanStep]:
    """Kahn's algorithm. step_order is tiebreaker."""
    indeg = {s.step_key: len(s.depends_on) for s in steps}
    ready = sorted(
        [s for s in steps if indeg[s.step_key] == 0],
        key=lambda s: s.step_order,
    )
    ordered = []
    while ready:
        s = ready.pop(0)
        ordered.append(s)
        for other in steps:
            if s.step_key in other.depends_on:
                indeg[other.step_key] -= 1
                if indeg[other.step_key] == 0:
                    ready.append(other)
                    ready.sort(key=lambda x: x.step_order)
    if len(ordered) != len(steps):
        raise RuntimeError("Plan contains a dependency cycle")
    return ordered


def _validate_dag_preflight(steps: list[PlanStep]):
    """Pre-execution DAG validation on DB data."""
    keys = [s.step_key for s in steps]
    if len(set(keys)) != len(keys):
        raise RuntimeError("Duplicate step_key in plan")
    for s in steps:
        if s.role not in ROLES:
            raise RuntimeError(f"Unknown role {s.role!r} in step {s.step_key}")
        for d in (s.depends_on or []):
            if not isinstance(d, str) or not d.strip():
                raise RuntimeError(f"Invalid dependency in step {s.step_key}")
            if d == s.step_key:
                raise RuntimeError(f"Step {s.step_key} depends on itself")
            if d not in keys:
                raise RuntimeError(f"Step {s.step_key} depends on unknown {d!r}")


def _final_status(statuses: list[str], any_cancelled: bool) -> str:
    if all(s in ("cancelled",) for s in statuses):
        return "cancelled"
    if any_cancelled and any(s not in ("cancelled", "pending") for s in statuses):
        return "partial"
    if any_cancelled:
        return "cancelled"
    if all(s == "skipped" for s in statuses):
        return "failed"
    if any(s == "success" for s in statuses):
        if any(s in ("failed", "skipped") for s in statuses):
            return "partial"
        return "success"
    return "failed"


def execute_plan(db: Session, task: Task, cancel_event=None) -> None:
    """Execute plan steps in DAG topological order. Exception-safe."""

    # ---- B0 Budget Immutability Guard (§5.1) ----
    guard_budget_immutable(task.status, {})

    # ---- Atomic CAS: queued → running ----
    updated = db.query(Task).filter(
        Task.id == task.id,
        Task.status == "queued",
    ).update({"status": "running"}, synchronize_session="fetch")
    if not updated:
        raise RuntimeError("Task already executing or not in queued state")
    db.commit()
    db.refresh(task)

    # ---- Pre-execution cancel ----
    if cancel_event and cancel_event.is_set():
        task.status = "cancelled"
        task.finished_at = _now()
        db.commit()
        _add_event(db, task.id, "task_cancelled", "Cancelled before execution")
        return

    task.execution_round += 1
    task.started_at = _now()
    db.commit()
    _add_event(db, task.id, "task_started", "NEXUS 2.0 execution started")

    steps = list(task.steps)
    try:
        _validate_dag_preflight(steps)
        ordered = _topological_order(steps)
    except RuntimeError as exc:
        _fail_task(db, task, f"DAG validation failed: {exc.__class__.__name__}")
        return

    # ---- Budget: max_steps ----
    max_steps = (task.budget or {}).get("max_steps", 5)
    if len(ordered) > max_steps:
        _fail_task(db, task, f"Plan has {len(ordered)} steps, exceeds max_steps={max_steps}")
        return

    # ---- Budget: max_agents (count unique agents) ----
    max_agents = (task.budget or {}).get("max_agents", 5)
    unique_roles = {s.role for s in ordered}
    if len(unique_roles) > max_agents:
        _fail_task(db, task, f"Plan uses {len(unique_roles)} roles, exceeds max_agents={max_agents}")
        return

    completed: dict[str, str] = {}
    any_cancelled = False
    used_agent_ids: set = set()

    for step in ordered:
        # Check terminal state FIRST (before cancel check)
        if step.status in ("success", "failed", "cancelled", "skipped"):
            if step.status == "success" and step.result:
                completed[step.step_key] = step.result
            continue

        # Cancel check for unstarted steps
        if cancel_event and cancel_event.is_set():
            step.status = "cancelled"
            any_cancelled = True
            db.commit()
            continue

        # Dependency check
        deps_ok = True
        for d in step.depends_on:
            if d not in completed:
                step.status = "skipped"
                step.error = f"Upstream step {d!r} not completed"
                db.commit()
                deps_ok = False
                break
        if not deps_ok:
            continue

        # Acquire agent
        try:
            agent_record = pick_agent(db, step.role)
            # Default-Deny Permission Check per B0 §4 (real adapters)
            if task.allowed_permissions and agent_record.adapter_type != "mock":
                req_perms = step.required_permissions or get_required_permissions_for_role(step.role)
                allowed, reason = check_permissions(
                    agent_permission_set=agent_record.permission_set or [],
                    required_permissions=req_perms,
                    task_allowed_permissions=task.allowed_permissions,
                )
                if not allowed:
                    step.status = "failed"
                    step.verification_status = "failed"
                    step.error = f"Permission denied: {reason}"
                    db.commit()
                    continue
            agent_instance = dispatch_agent(agent_record)
        except (RuntimeError, ValueError, ImportError) as exc:
            step.status = "failed"
            step.verification_status = "failed"
            step.error = f"Cannot acquire agent: {exc.__class__.__name__}"
            db.commit()
            continue

        used_agent_ids.add(agent_record.id)

        # Build context
        goal = step.goal
        if step.depends_on:
            ctx_parts = [
                f"[上游结果] {k}: {completed[k][:2000]}"
                for k in step.depends_on if k in completed
            ]
            goal = NL.join(ctx_parts) + NL + NL + "[当前任务]" + NL + goal

        # Start execution
        step.status = "running"
        step.attempts += 1
        db.commit()
        _add_event(db, task.id, "step_started", f"Step {step.step_key} ({step.role}) started", {"step_key": step.step_key, "role": step.role})

        arun = AgentRun(
            task_id=task.id, step_id=step.id,
            agent_id=agent_record.id, status="running",
        )
        db.add(arun)
        db.commit()
        arun_id = arun.id  # save for rollback recovery

        # ---- Execute agent ----
        output = None
        exec_error = None
        try:
            output = agent_instance.run(goal, cancel_event)
        except Exception as exc:
            exec_error = exc.__class__.__name__

        # ---- Rollback and recover ----
        db.rollback()
        # Re-fetch after rollback
        step = db.get(PlanStep, step.id)
        arun = db.get(AgentRun, arun_id)
        task = db.get(Task, task.id)

        if not step or not arun:
            # Catastrophic: objects gone after rollback
            _fail_task(db, task, "State recovery failed after agent execution")
            return

        if exec_error:
            step.status = "failed"
            step.error = f"Agent execution error"
            arun.status = "failed"
            arun.finished_at = _now()
            db.commit()
            continue

        # ---- Validate output ----
        validation_msg = _validate_agent_result(output)
        if validation_msg != "ok":
            step.status = "failed"
            step.error = f"Invalid agent output"
            arun.status = "failed"
            arun.finished_at = _now()
            db.commit()
            continue

        # ---- Success ----
        step.status = "success"
        step.verification_status = "passed"
        arun.status = "success"
        arun.input_tokens = output.input_tokens
        arun.output_tokens = output.output_tokens
        arun.finished_at = _now()
        step.result = output.result
        db.commit()
        completed[step.step_key] = output.result
        _add_event(db, task.id, "step_completed", f"Step {step.step_key} completed successfully", {
            "step_key": step.step_key,
            "role": step.role,
            "input_tokens": output.input_tokens,
            "output_tokens": output.output_tokens,
            "result_preview": (output.result or "")[:300]
        })

        try:
            from app.router.metrics import record_agent_execution
            record_agent_execution(
                db=db,
                agent_id=agent_record.id,
                status="success",
                input_tokens=output.input_tokens,
                output_tokens=output.output_tokens,
            )
        except Exception:
            pass

    # ---- Final status per B0 §1.4 authoritative aggregation ----
    active_payload = [
        {
            "status": s.status,
            "verification_status": getattr(s, "verification_status", None) or ("passed" if s.status == "success" else "failed"),
        }
        for s in task.steps
    ]
    has_passed = any(s.status == "success" for s in task.steps)
    all_passed = all(s.status == "success" for s in task.steps)
    task_verifier = "PASSED" if all_passed else ("FAILED" if not has_passed else "INCONCLUSIVE")
    agg_status, _ = aggregate_task_status(
        active_subtasks=active_payload,
        verifier_result=task_verifier,
        can_replan=False,
        replan_count=task.replan_count or 0,
    )
    if any_cancelled and agg_status not in ("cancelled", "partial"):
        agg_status = "cancelled"
    task.status = agg_status
    task.result = NL + NL + "---" + NL + NL + "".join(
        f"[{s.step_key}] {s.status}: {s.result or s.error or ''}" + NL
        for s in task.steps
    )
    task.finished_at = _now()
    db.commit()
    _add_event(db, task.id, f"task_{task.status}", f"Completed: {task.status}")

    # M3 Continuous Learning: Distill experience into durable long-term memory
    try:
        from app.memory.distiller import distill_task_experience
        distill_task_experience(db, task)
    except Exception:
        pass


def _fail_task(db: Session, task: Task, reason: str):
    """Safely mark task as failed with event."""
    task.status = "failed"
    task.finished_at = _now()
    task.warnings = (task.warnings or []) + [reason]
    db.commit()
    try:
        _add_event(db, task.id, "task_failed", reason)
        from app.memory.distiller import distill_task_experience
        distill_task_experience(db, task)
    except Exception:
        pass  # best-effort event logging
