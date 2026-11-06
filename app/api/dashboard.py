"""
NEXUS CORE 2.1 — Dashboard Aggregation Endpoint.
Prefix: /api/dashboard
"""

from fastapi import APIRouter
from app.agents.manager import agent_manager
from app.model_hub.manager import model_hub_manager
from app.model_hub.router import model_router
from app.usage.collector import usage_collector
from app.usage.budget import budget_guard
from app.usage.reports import usage_reporter

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview")
def get_dashboard_overview():
    """
    Returns aggregated real-time operational payload for NEXUS Control Center.
    Powers the dark-tech command center overview with zero latency.
    """
    agents = agent_manager.list_agents()
    models = model_hub_manager.list_models()
    usage = usage_collector.get_summary()
    budget_res = budget_guard.check_budget()
    rankings = usage_reporter.get_agent_rankings()[:5]
    model_dist = usage_reporter.get_model_distribution()[:5]
    trends = usage_reporter.get_time_series_trends()
    policy = model_router.get_policy()

    active_agents_count = len([a for a in agents if a.status.value == "active"])
    connected_models_count = len([m for m in models if m.enabled and m.health_status == "connected"])

    return {
        "status": "healthy",
        "version": "2.1.0",
        "system": {
            "core_engine": "online",
            "active_agents": active_agents_count,
            "total_agents": len(agents),
            "connected_models": connected_models_count,
            "total_models": len(models),
            "routing_mode": policy.mode.value,
        },
        "kpi": {
            "today_tokens": usage.today_tokens,
            "today_cost_usd": usage.today_cost_usd,
            "today_tasks": usage.today_tasks_count,
            "avg_tokens_per_task": usage.avg_tokens_per_task,
            "real_tokens_pct": usage.real_tokens_pct,
            "estimated_tokens_pct": usage.estimated_tokens_pct,
        },
        "budget": budget_res.model_dump(),
        "recent_agent_leaderboard": [r.model_dump() for r in rankings],
        "model_cost_share": [m.model_dump() for m in model_dist],
        "time_series_trends": trends,
    }
