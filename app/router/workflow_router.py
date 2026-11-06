"""
NEXUS CORE 2.1 — Task Topology & Domain Intent Router (§ROUTER-WORKFLOW).
Differentiates user intents into domain pipelines:
- DEV: Autonomous software engineering (Requirements -> Code -> Test -> Review -> Release)
- OPS: SRE autonomous self-healing (Telemetry -> Incident -> Diagnosis -> Remediation -> Verify)
- GENERAL: Standard Task DAG or Single-Agent execution
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.router.classifier import TaskComplexity, classify_task


class WorkflowDomain(str, Enum):
    DEV = "dev"
    OPS = "ops"
    GENERAL = "general"


class ExecutionTopology(str, Enum):
    DIRECT_SINGLE_AGENT = "direct_single_agent"
    DAG_ORCHESTRATED = "dag_orchestrated"


class WorkflowRoutingDecision(BaseModel):
    domain: WorkflowDomain
    topology: ExecutionTopology
    complexity: TaskComplexity
    primary_role: str
    target_pipeline: str
    reason: str
    suggested_max_steps: int = 1
    requires_approval: bool = False


DEV_KEYWORDS = [
    "写代码", "编写代码", "开发", "实现功能", "修复bug", "repair", "fix bug",
    "单元测试", "重构", "refactor", "code generation", "pull request",
    "git commit", "api接口实现", "feature", "tdd", "lint", "code review"
]

OPS_KEYWORDS = [
    "告警", "报警", "cpu飙高", "内存泄漏", "pod 崩溃", "oom", "502", "504",
    "服务宕机", "重启服务", "自愈", "sre", "incident", "remediation", "prometheus",
    "回滚发布", "网络丢包", "磁盘满了", "disk full", "service down"
]


def route_workflow_intent(
    goal: str,
    context: Optional[Dict[str, Any]] = None,
) -> WorkflowRoutingDecision:
    """
    Analyzes task goal and context to route to the appropriate domain pipeline
    and execution topology (Single Agent vs Multi-Agent DAG).
    """
    ctx = context or {}
    text_lower = goal.lower()
    
    # 1. Evaluate baseline complexity
    classification = classify_task(goal)

    # 2. Check for explicit domain override in context
    explicit_domain = ctx.get("domain")
    if explicit_domain == "dev":
        return WorkflowRoutingDecision(
            domain=WorkflowDomain.DEV,
            topology=ExecutionTopology.DAG_ORCHESTRATED,
            complexity=classification.complexity,
            primary_role="dev-coder",
            target_pipeline="app.dev.orchestrator.DevOrchestrator",
            reason="Explicit context override specified DEV pipeline.",
            suggested_max_steps=max(3, classification.suggested_max_steps),
            requires_approval=True,
        )
    if explicit_domain == "ops":
        return WorkflowRoutingDecision(
            domain=WorkflowDomain.OPS,
            topology=ExecutionTopology.DAG_ORCHESTRATED,
            complexity=classification.complexity,
            primary_role="ops-remediator",
            target_pipeline="app.ops.orchestrator.OpsOrchestrator",
            reason="Explicit context override specified OPS pipeline.",
            suggested_max_steps=max(3, classification.suggested_max_steps),
            requires_approval=True,
        )

    # 3. Detect OPS Domain
    if any(k in text_lower for k in OPS_KEYWORDS):
        return WorkflowRoutingDecision(
            domain=WorkflowDomain.OPS,
            topology=ExecutionTopology.DAG_ORCHESTRATED,
            complexity=classification.complexity,
            primary_role="ops-investigator",
            target_pipeline="app.ops.orchestrator.OpsOrchestrator",
            reason="Task involves infrastructure anomalies, alerts, or remediation procedures.",
            suggested_max_steps=4,
            requires_approval=True,
        )

    # 4. Detect DEV Domain
    if any(k in text_lower for k in DEV_KEYWORDS):
        return WorkflowRoutingDecision(
            domain=WorkflowDomain.DEV,
            topology=ExecutionTopology.DAG_ORCHESTRATED if classification.complexity != TaskComplexity.SIMPLE else ExecutionTopology.DIRECT_SINGLE_AGENT,
            complexity=classification.complexity,
            primary_role="dev-coder",
            target_pipeline="app.dev.orchestrator.DevOrchestrator",
            reason="Task involves code implementation, test suites, or defect repairs.",
            suggested_max_steps=classification.suggested_max_steps,
            requires_approval=False,
        )

    # 5. Default General Domain
    topology = (
        ExecutionTopology.DIRECT_SINGLE_AGENT
        if classification.complexity == TaskComplexity.SIMPLE
        else ExecutionTopology.DAG_ORCHESTRATED
    )
    return WorkflowRoutingDecision(
        domain=WorkflowDomain.GENERAL,
        topology=topology,
        complexity=classification.complexity,
        primary_role=classification.primary_role,
        target_pipeline="app.b1.engine.ExecutionEngine",
        reason=f"General task classified as {classification.complexity.value}: {classification.reason}",
        suggested_max_steps=classification.suggested_max_steps,
        requires_approval=False,
    )
