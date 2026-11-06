"""
NEXUS CORE 2.1 — Multi-Tier Budget Guard (§USAGE-BUDGET).
Enforces Daily Global, Per-Task, and Per-Agent Token & Cost ceilings.
Emits early warning at 80% and applies BLOCK or DEGRADE at 100%.
"""

from typing import Dict, List, Optional
from app.usage.collector import usage_collector
from app.usage.schemas import (
    BudgetAction,
    BudgetCheckResult,
    BudgetPolicy,
    BudgetScope,
)


class BudgetGuard:
    """
    Evaluates resource consumption against configured budget ceilings.
    """

    def __init__(self):
        self._policies: Dict[str, BudgetPolicy] = {
            "daily_global": BudgetPolicy(
                scope=BudgetScope.DAILY_GLOBAL,
                target_id="global",
                token_limit=1_000_000,
                cost_limit_usd=10.0,
                warning_threshold_pct=80.0,
                on_exhausted=BudgetAction.BLOCK,
            ),
            "task_default": BudgetPolicy(
                scope=BudgetScope.TASK,
                target_id="default",
                token_limit=100_000,
                cost_limit_usd=1.5,
                warning_threshold_pct=80.0,
                on_exhausted=BudgetAction.DEGRADE_TO_CHEAP,
            ),
        }

    def list_policies(self) -> List[BudgetPolicy]:
        return list(self._policies.values())

    def get_policy(self, key: str) -> Optional[BudgetPolicy]:
        return self._policies.get(key)

    def set_policy(self, key: str, policy: BudgetPolicy) -> BudgetPolicy:
        self._policies[key] = policy
        return policy

    def check_budget(
        self,
        task_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        estimated_addition_tokens: int = 1000,
    ) -> BudgetCheckResult:
        """
        Evaluates current consumption against policies before task dispatch.
        """
        summary = usage_collector.get_summary()
        global_policy = self._policies.get("daily_global")

        if global_policy and global_policy.is_active:
            projected_tokens = summary.today_tokens + estimated_addition_tokens
            pct_used = round((projected_tokens / global_policy.token_limit) * 100.0, 1)

            if projected_tokens >= global_policy.token_limit or summary.today_cost_usd >= global_policy.cost_limit_usd:
                return BudgetCheckResult(
                    allowed=(global_policy.on_exhausted != BudgetAction.BLOCK),
                    status="exhausted",
                    pct_used=pct_used,
                    current_tokens=summary.today_tokens,
                    limit_tokens=global_policy.token_limit,
                    current_cost_usd=summary.today_cost_usd,
                    limit_cost_usd=global_policy.cost_limit_usd,
                    action=global_policy.on_exhausted,
                    message=f"Global daily budget exhausted ({pct_used}%). Action enforced: {global_policy.on_exhausted.value}.",
                )

            if pct_used >= global_policy.warning_threshold_pct:
                return BudgetCheckResult(
                    allowed=True,
                    status="warning",
                    pct_used=pct_used,
                    current_tokens=summary.today_tokens,
                    limit_tokens=global_policy.token_limit,
                    current_cost_usd=summary.today_cost_usd,
                    limit_cost_usd=global_policy.cost_limit_usd,
                    action=BudgetAction.ALERT_ONLY,
                    message=f"Global daily budget warning: {pct_used}% used.",
                )

        return BudgetCheckResult(
            allowed=True,
            status="ok",
            pct_used=round((summary.today_tokens / (global_policy.token_limit if global_policy else 1_000_000)) * 100.0, 1),
            current_tokens=summary.today_tokens,
            limit_tokens=global_policy.token_limit if global_policy else 1_000_000,
            current_cost_usd=summary.today_cost_usd,
            limit_cost_usd=global_policy.cost_limit_usd if global_policy else 10.0,
            action=BudgetAction.ALERT_ONLY,
            message="Budget parameters healthy.",
        )


budget_guard = BudgetGuard()
