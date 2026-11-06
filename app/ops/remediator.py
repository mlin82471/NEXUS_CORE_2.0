"""
NEXUS CORE 2.1 — NEXUS OPS Remediation Planner (§OPS-5).
Synthesizes structured RemediationPlans with explicit preconditions, rollback commands,
and automated integration with Platform PolicyEngine and ApprovalGate.
"""

import uuid
from typing import Any, Dict, List, Optional
from app.ops.schemas import Incident, RemediationAction, RemediationPlan, RootCauseReport, OpsPlanStatus
from app.platform.policy import RiskLevel, policy_engine
from app.platform.approval import approval_gate


class RemediationPlanner:
    """
    Formulates safe, risk-assessed operational recovery plans.
    """

    def plan_remediation(
        self,
        incident: Incident,
        rca: RootCauseReport,
        target_service: str = "nexus-worker",
    ) -> RemediationPlan:
        plan_id = f"plan-{uuid.uuid4().hex[:8]}"
        actions: List[RemediationAction] = []
        rollback_steps: List[str] = []
        preconditions: List[str] = ["Host system responsive", f"Service '{target_service}' registered"]

        metric = incident.trigger_metric

        if metric == "memory_usage_pct":
            # Action 1: Graceful restart of worker pool
            actions.append(
                RemediationAction(
                    action_id=f"act-1-{plan_id[-4:]}",
                    description=f"Perform rolling restart of {target_service} to release leaked buffers",
                    command=f"systemctl restart {target_service}",
                    target_resource=target_service,
                    risk_level=RiskLevel.L2_SERVICE_CONFIG,
                    reversible=True,
                    rollback_command=f"systemctl status {target_service}",
                )
            )
            rollback_steps.append(f"Check backup state or revert {target_service} configuration")
            expected_health = {"memory_usage_pct": "< 75.0%"}

        elif metric == "cpu_usage_pct":
            # Action: Throttle concurrency or restart stuck worker
            actions.append(
                RemediationAction(
                    action_id=f"act-1-{plan_id[-4:]}",
                    description=f"Terminate rogue worker processes and clear transient worker queue",
                    command=f"pkill -f {target_service}-stuck || true",
                    target_resource=target_service,
                    risk_level=RiskLevel.L2_SERVICE_CONFIG,
                    reversible=True,
                    rollback_command=f"systemctl start {target_service}",
                )
            )
            rollback_steps.append(f"Restart {target_service} in safe single-thread mode")
            expected_health = {"cpu_usage_pct": "< 50.0%"}

        elif metric == "error_rate_pct":
            # Action: Re-establish connection pool or toggle upstream health
            actions.append(
                RemediationAction(
                    action_id=f"act-1-{plan_id[-4:]}",
                    description="Reset connection pool and re-verify upstream health endpoint",
                    command=f"python scripts/healthcheck.py --target {target_service}",
                    target_resource=target_service,
                    risk_level=RiskLevel.L1_REVERSIBLE,
                    reversible=True,
                    rollback_command=None,
                )
            )
            rollback_steps.append("Divert traffic to standby gateway")
            expected_health = {"error_rate_pct": "< 1.0%"}

        else:
            actions.append(
                RemediationAction(
                    action_id=f"act-1-{plan_id[-4:]}",
                    description="Perform diagnostics inspection",
                    command="echo 'Running diagnostics'",
                    target_resource=target_service,
                    risk_level=RiskLevel.L0_READ_ONLY,
                    reversible=True,
                )
            )
            expected_health = {"status": "ok"}

        # Calculate authoritative overall risk level (maximum of all actions)
        max_risk = max((a.risk_level for a in actions), default=RiskLevel.L0_READ_ONLY)

        plan = RemediationPlan(
            plan_id=plan_id,
            incident_id=incident.incident_id,
            title=f"Remediation Plan for {incident.title}",
            root_cause_hypothesis=rca.root_cause_hypothesis,
            confidence=rca.confidence,
            proposed_actions=actions,
            overall_risk_level=max_risk,
            preconditions=preconditions,
            rollback_plan=rollback_steps,
            expected_health_state=expected_health,
            status=OpsPlanStatus.DRAFT,
        )

        # If risk requires approval (>= L2), register request with Platform ApprovalGate
        if policy_engine.requires_human_approval(max_risk):
            apr = approval_gate.request_approval(
                task_id=incident.incident_id,
                requester_agent_id="ops-remediator",
                action_type="service_restart" if max_risk == RiskLevel.L2_SERVICE_CONFIG else "destructive_ops",
                description=plan.title,
                payload={"plan_id": plan_id, "actions": [a.description for a in actions]},
                command=actions[0].command if actions else None,
            )
            plan.approval_request_id = apr.request_id
            plan.approval_token = apr.approval_token
            plan.status = OpsPlanStatus.PENDING_APPROVAL
        else:
            plan.status = OpsPlanStatus.APPROVED

        return plan
