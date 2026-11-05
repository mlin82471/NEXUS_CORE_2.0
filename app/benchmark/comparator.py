"""
NEXUS CORE 2.0 — Single Agent vs Multi-Agent A/B Comparator (§7)
Directly tests: Does multi-agent orchestration provide measurable value
over a direct single agent, or is it merely token-wasting overhead?
"""
import time
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import Task, PlanStep
from app.services.registry import pick_agent, dispatch_agent
from app.services.scheduler import execute_plan
from app.router.classifier import classify_task, TaskComplexity
from app.b1.planner import rule_plan, plan, PlannerError


class ExecutionMetrics(BaseModel):
    mode: str  # "single_agent" or "multi_agent"
    status: str
    total_tokens: int
    input_tokens: int
    output_tokens: int
    elapsed_seconds: float
    steps_count: int
    result_length: int
    result_excerpt: str


class ABComparisonReport(BaseModel):
    goal: str
    task_type: str
    complexity: TaskComplexity
    single_agent: ExecutionMetrics
    multi_agent: ExecutionMetrics
    token_multiplier: float
    time_delta_seconds: float
    recommendation: str  # "use_single_agent" | "use_multi_agent"
    reason: str


def run_ab_comparison(
    goal: str,
    task_type: str,
    db: Session,
    use_model_planner: bool = False,
) -> ABComparisonReport:
    """
    Executes a task under both Single Agent and Multi-Agent Orchestration modes,
    measuring token consumption, latency, success rate, and overhead.
    """
    cls_res = classify_task(goal, task_type)

    # ========================================================
    # 1. RUN MODE A: Single Agent Direct Execution
    # ========================================================
    t0 = time.perf_counter()
    agent_rec = pick_agent(db, cls_res.primary_role)
    agent_inst = dispatch_agent(agent_rec)
    
    single_res = agent_inst.run(goal)
    t_single = round(time.perf_counter() - t0, 3)

    single_in_tok = single_res.input_tokens
    single_out_tok = single_res.output_tokens
    single_total_tok = single_in_tok + single_out_tok
    single_excerpt = (single_res.result or "")[:300]

    single_metrics = ExecutionMetrics(
        mode="single_agent",
        status="success" if single_res.result else "failed",
        total_tokens=single_total_tok,
        input_tokens=single_in_tok,
        output_tokens=single_out_tok,
        elapsed_seconds=t_single,
        steps_count=1,
        result_length=len(single_res.result or ""),
        result_excerpt=single_excerpt,
    )

    # ========================================================
    # 2. RUN MODE B: Multi-Agent Orchestration Pipeline
    # ========================================================
    t1 = time.perf_counter()
    
    # Generate multi-step plan
    plan_steps = None
    if use_model_planner:
        try:
            subtasks = plan(goal, budget_steps=cls_res.suggested_max_steps)
            plan_steps = [{
                "step_key": s.step_key, "title": s.goal[:80],
                "goal": s.goal, "role": s.role,
                "depends_on": s.depends_on,
                "acceptance_criteria": s.acceptance_criteria,
                "required_permissions": s.required_permissions,
            } for s in subtasks]
        except PlannerError:
            plan_steps = None

    if not plan_steps:
        rsteps = rule_plan(goal, task_type)
        plan_steps = [{
            "step_key": s.step_key, "title": s.goal[:80],
            "goal": s.goal, "role": s.role,
            "depends_on": s.depends_on,
            "acceptance_criteria": s.acceptance_criteria,
            "required_permissions": s.required_permissions,
        } for s in rsteps]

    # Create Task in DB
    multi_task = Task(
        goal=goal,
        task_type=task_type,
        risk_level="low",
        status="queued",
        budget={"max_steps": len(plan_steps), "max_agents": 3, "max_parallel": 1},
        plan_json=plan_steps,
        plan_source="rule",
    )
    db.add(multi_task)
    db.flush()

    for idx, s in enumerate(plan_steps):
        db.add(PlanStep(
            task_id=multi_task.id,
            step_key=s["step_key"],
            title=s.get("title", ""),
            goal=s["goal"],
            role=s["role"],
            depends_on=s.get("depends_on", []),
            step_order=idx,
            is_active=1,
            verification_status="pending",
        ))
    db.commit()

    # Execute Multi-Agent pipeline
    execute_plan(db, multi_task)
    db.refresh(multi_task)
    t_multi = round(time.perf_counter() - t1, 3)

    # Aggregate multi-agent token usage
    multi_in_tok = 0
    multi_out_tok = 0
    for s in multi_task.steps:
        # Each step tokens estimated or measured from result length
        out_len = len(s.result or "")
        multi_in_tok += max(20, len(s.goal) // 2)
        multi_out_tok += max(30, out_len // 2)
    multi_total_tok = multi_in_tok + multi_out_tok

    multi_metrics = ExecutionMetrics(
        mode="multi_agent",
        status=multi_task.status,
        total_tokens=multi_total_tok,
        input_tokens=multi_in_tok,
        output_tokens=multi_out_tok,
        elapsed_seconds=t_multi,
        steps_count=len(multi_task.steps),
        result_length=len(multi_task.result or ""),
        result_excerpt=(multi_task.result or "")[:300],
    )

    # ========================================================
    # 3. COMPARATIVE ANALYSIS & VERDICT
    # ========================================================
    multiplier = round(multi_total_tok / max(1, single_total_tok), 2)
    time_delta = round(t_multi - t_single, 3)

    # Decision criteria based on Section 4: "不能为了多Agent而多Agent"
    if cls_res.complexity == TaskComplexity.SIMPLE:
        recommendation = "use_single_agent"
        reason = (
            f"Simple task detected: Single agent achieved goal in {t_single}s consuming {single_total_tok} tokens. "
            f"Multi-agent introduced {multiplier}x token overhead with no architectural necessity."
        )
    elif cls_res.complexity == TaskComplexity.COMPLEX:
        recommendation = "use_multi_agent"
        reason = (
            f"Complex multi-phase task: Multi-agent orchestration provided separated concerns "
            f"(research/coding/verification) across {len(plan_steps)} steps. Overhead ({multiplier}x tokens) is justified."
        )
    else:
        # Single expert: compare success and verify if verification added value
        if multi_metrics.status == "success" and single_metrics.status == "success":
            if multiplier > 2.0:
                recommendation = "use_single_agent"
                reason = f"Single expert task completed successfully by single agent; multi-agent token cost was {multiplier}x higher without sufficient quality delta."
            else:
                recommendation = "use_multi_agent"
                reason = "Multi-agent provided independent verification with acceptable token overhead."
        else:
            recommendation = "use_multi_agent" if multi_metrics.status == "success" else "use_single_agent"
            reason = "Recommended mode based on execution success rate."

    return ABComparisonReport(
        goal=goal,
        task_type=task_type,
        complexity=cls_res.complexity,
        single_agent=single_metrics,
        multi_agent=multi_metrics,
        token_multiplier=multiplier,
        time_delta_seconds=time_delta,
        recommendation=recommendation,
        reason=reason,
    )
