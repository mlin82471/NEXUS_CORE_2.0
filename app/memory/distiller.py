"""
NEXUS CORE 2.0 — Experience Distiller & Failure RCA Engine (§3 & §M3)
Transforms raw task execution logs into structured long-term memories:
- Success Best Practices
- Failure Root-Cause Analysis (RCA)
- Reusable Knowledge Extraction
"""
import re
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models import Task, PlanStep, TaskExperience, KnowledgeItem


def _classify_failure_cause(error_text: str) -> str:
    """Classifies raw error messages into canonical RCA categories."""
    low = (error_text or "").lower()
    if "timeout" in low or "exceeded" in low:
        return "TIMEOUT: Execution exceeded wall-clock limit"
    if "permission" in low or "denied" in low:
        return "PERMISSION_DENIED: Agent lacked required permission ceiling"
    if "acquire" in low or "unreachable" in low or "import" in low:
        return "ADAPTER_UNAVAILABLE: External execution node offline or unconfigured"
    if "upstream" in low or "depend" in low:
        return "UPSTREAM_FAILURE: Upstream step failed or was skipped"
    if "budget" in low or "exhaust" in low or "max_steps" in low or "exceeds" in low:
        return "BUDGET_EXHAUSTED: Token or step budget ceiling breached"
    if "dag" in low or "cycle" in low:
        return "PLAN_DEFECT: Cyclic or invalid dependency graph produced by planner"
    return "RUNTIME_ERROR: Unexpected execution exception"


def distill_task_experience(db: Session, task: Task) -> TaskExperience:
    """
    Distills execution results into a durable TaskExperience record.
    Idempotent: updates existing experience if already distilled.
    """
    # 1. Analyze steps & failures
    plan_summary = []
    failure_reasons = []
    total_tokens = 0
    
    for s in task.steps:
        s_info = {
            "step_key": s.step_key,
            "role": s.role,
            "status": s.status,
            "attempts": s.attempts,
        }
        plan_summary.append(s_info)

        if s.status in ("failed", "skipped") and s.error:
            rca = _classify_failure_cause(s.error)
            failure_reasons.append(f"[{s.step_key}] {rca}: {s.error}")

        # Compute tokens
        for arun in s.agent_runs:
            total_tokens += (arun.input_tokens or 0) + (arun.output_tokens or 0)

    # 2. Formulate Lessons Learned
    if task.status == "success":
        roles_sequence = " -> ".join([s.role for s in task.steps])
        lessons = (
            f"SUCCESSFUL PATTERN: Goal '{task.goal[:60]}...' achieved via sequence [{roles_sequence}]. "
            f"All {len(task.steps)} steps verified. Plan source: {task.plan_source}."
        )
    elif task.status == "partial":
        lessons = (
            f"PARTIAL COMPLETION: Partial success achieved. Replan count: {task.replan_count}. "
            f"Defects identified in: {'; '.join(failure_reasons)}."
        )
    else:
        lessons = (
            f"FAILURE WARNING: Task failed with {len(failure_reasons)} error(s). "
            f"Primary RCA: {failure_reasons[0] if failure_reasons else 'General execution failure'}. "
            f"Future tasks matching this pattern require proactive resource allocation and pre-flight checks."
        )

    # 3. Calculate execution duration
    duration_s = 0
    if task.started_at and task.finished_at:
        duration_s = max(0, int((task.finished_at - task.started_at).total_seconds()))

    # 4. Check existing experience record
    exp = db.query(TaskExperience).filter(TaskExperience.task_id == task.id).first()
    if not exp:
        exp = TaskExperience(
            task_id=task.id,
            goal=task.goal,
            task_type=task.task_type,
            complexity=getattr(task, "complexity", "simple") or "simple",
            status=task.status,
            plan_summary=plan_summary,
            lessons_learned=lessons,
            failure_reasons=failure_reasons,
            token_cost=total_tokens,
            execution_time_s=duration_s,
        )
        db.add(exp)
    else:
        exp.status = task.status
        exp.plan_summary = plan_summary
        exp.lessons_learned = lessons
        exp.failure_reasons = failure_reasons
        exp.token_cost = total_tokens
        exp.execution_time_s = duration_s

    # 5. Extract reusable code knowledge if task succeeded and contains clean code
    if task.status == "success" and "```python" in (task.result or ""):
        code_blocks = re.findall(r"```python\s*([\s\S]*?)```", task.result or "")
        if code_blocks:
            k_key = f"code_solution_{task.id}"
            existing_k = db.query(KnowledgeItem).filter(KnowledgeItem.key == k_key).first()
            if not existing_k:
                snippet = KnowledgeItem(
                    key=k_key,
                    category="code_snippet",
                    content=code_blocks[0].strip(),
                    tags=[task.task_type, "python", "verified_solution"],
                    source_task_id=task.id,
                )
                db.add(snippet)

    db.commit()
    db.refresh(exp)
    return exp
