"""
NEXUS CORE 2.1 — Usage & Cost Center Schemas (§USAGE-SCHEMAS).
Strictly separates provider-reported actual tokens from locally-counted
or estimated values, and provides contracts for multi-tier budgeting.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class UsageSource(str, Enum):
    PROVIDER_REPORTED = "provider_reported"  # Official usage from API response header/body
    LOCALLY_COUNTED = "locally_counted"      # Verified token count from local tokenizer (e.g. tiktoken)
    ESTIMATED = "estimated"                  # Rough estimate (char-heuristic); NEVER mix into financial audit
    UNAVAILABLE = "unavailable"              # Provider failed to report


class BudgetScope(str, Enum):
    DAILY_GLOBAL = "daily_global"
    TASK = "task"
    AGENT = "agent"


class BudgetAction(str, Enum):
    BLOCK = "block"
    DEGRADE_TO_CHEAP = "degrade_to_cheap"
    ALERT_ONLY = "alert_only"


class UsageRecord(BaseModel):
    record_id: str
    task_id: str
    subtask_id: Optional[str] = None
    agent_id: str
    provider_id: str
    model_id: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    reasoning_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    usage_source: UsageSource = UsageSource.PROVIDER_REPORTED
    recorded_at: str = ""
    is_retry: bool = False


class BudgetPolicy(BaseModel):
    scope: BudgetScope
    target_id: Optional[str] = "global"  # e.g. "global", or specific agent_id
    token_limit: int = 500000            # daily or per-task limit
    cost_limit_usd: float = 5.0          # daily or per-task limit in USD
    warning_threshold_pct: float = 80.0  # triggers warning when usage >= 80%
    on_exhausted: BudgetAction = BudgetAction.BLOCK
    is_active: bool = True


class BudgetCheckResult(BaseModel):
    allowed: bool
    status: str                          # ok, warning, exhausted
    pct_used: float
    current_tokens: int
    limit_tokens: int
    current_cost_usd: float
    limit_cost_usd: float
    action: BudgetAction
    message: str


class UsageSummary(BaseModel):
    today_tokens: int
    today_cost_usd: float
    today_tasks_count: int
    avg_tokens_per_task: int
    real_tokens_pct: float               # Percentage of provider-reported or locally-counted tokens
    estimated_tokens_pct: float          # Percentage of estimated tokens (transparent audit)


class AgentRanking(BaseModel):
    agent_id: str
    agent_name: str
    total_tokens: int
    total_cost_usd: float
    task_count: int
    avg_tokens_per_task: int
    efficiency_score: float              # 0.0 - 1.0


class ModelCostDistribution(BaseModel):
    model_id: str
    provider_id: str
    total_tokens: int
    cost_usd: float
    share_pct: float


class TaskCostAudit(BaseModel):
    task_id: str
    goal_preview: str
    total_tokens: int
    retry_tokens: int
    total_cost_usd: float
    retry_overhead_pct: float            # cost wasted on retries
