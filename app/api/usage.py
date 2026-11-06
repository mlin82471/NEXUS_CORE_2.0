"""
NEXUS CORE 2.1 — Usage & Cost API Endpoints.
Prefix: /api/usage
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from app.usage.budget import budget_guard
from app.usage.collector import usage_collector
from app.usage.reports import usage_reporter
from app.usage.schemas import (
    AgentRanking,
    BudgetCheckResult,
    BudgetPolicy,
    ModelCostDistribution,
    TaskCostAudit,
    UsageRecord,
    UsageSummary,
)

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/summary", response_model=UsageSummary)
def get_usage_summary():
    """Get high-level KPI chips for today's token & cost usage."""
    return usage_collector.get_summary()


@router.get("/records", response_model=List[UsageRecord])
def get_usage_records(
    agent_id: Optional[str] = None,
    model_id: Optional[str] = None,
    task_id: Optional[str] = None,
    limit: int = 50,
):
    """Get itemized usage records with verified usage_source."""
    return usage_collector.list_records(agent_id=agent_id, model_id=model_id, task_id=task_id, limit=limit)


@router.get("/by-agent", response_model=List[AgentRanking])
def get_agent_rankings():
    """Get Agent consumption leaderboard and efficiency scores."""
    return usage_reporter.get_agent_rankings()


@router.get("/by-model", response_model=List[ModelCostDistribution])
def get_model_distribution():
    """Get model cost distribution and percentage shares."""
    return usage_reporter.get_model_distribution()


@router.get("/task-audits", response_model=List[TaskCostAudit])
def get_task_retry_audits():
    """Get tasks with retry inflation and overhead analysis."""
    return usage_reporter.get_task_retry_audits()


@router.get("/trends")
def get_time_series_trends():
    """Get 7-day token & cost trends for chart rendering."""
    return usage_reporter.get_time_series_trends()


@router.get("/budget/policies", response_model=List[BudgetPolicy])
def get_budget_policies():
    """Get configured budget policies across tiers."""
    return budget_guard.list_policies()


@router.post("/budget/policies/{policy_key}", response_model=BudgetPolicy)
def set_budget_policy(policy_key: str, policy: BudgetPolicy):
    """Set or update a specific budget policy."""
    return budget_guard.set_policy(policy_key, policy)


@router.get("/budget/check", response_model=BudgetCheckResult)
def check_budget_status():
    """Run proactive budget status evaluation."""
    return budget_guard.check_budget()
