"""
NEXUS CORE 2.1 — Control Center Backend Test Suite (§TEST-CONTROL-CENTER).
Comprehensive unit and integration tests covering:
1. Agent Management (5-step wizard, templates, toggles, test run)
2. Model Hub (7 providers, key masking, connection test, smart router)
3. Usage & Cost Center (real vs estimated, pricing math, budget guard, reports)
4. Control Center RESTful APIs
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.agents.manager import agent_manager
from app.agents.schemas import (
    AgentCreateWizardRequest,
    AgentRole,
    AgentStatus,
    AgentTestRequest,
    PermissionLevel,
)
from app.agents.templates import list_templates, get_template
from app.model_hub.manager import model_hub_manager
from app.model_hub.schemas import (
    ConnectionTestRequest,
    ModelCreateRequest,
    ProviderType,
    RoutingMode,
    RoutingPolicy,
)
from app.model_hub.router import model_router
from app.model_hub.providers import list_provider_presets
from app.usage.collector import usage_collector
from app.usage.pricing import compute_usage_cost_usd
from app.usage.budget import budget_guard
from app.usage.reports import usage_reporter
from app.usage.schemas import (
    BudgetAction,
    BudgetPolicy,
    BudgetScope,
    UsageSource,
)


@pytest.fixture
def client():
    return TestClient(app)


# ============================================================================
# 1. Agent Management Tests
# ============================================================================

def test_agent_templates_registry():
    templates = list_templates()
    assert len(templates) >= 6
    tpl_coder = get_template("tpl-coder")
    assert tpl_coder.role == AgentRole.CODING
    assert tpl_coder.default_budget_tokens == 35000
    assert "write_files" in tpl_coder.recommended_tools


def test_agent_manager_defaults_and_filtering():
    agents = agent_manager.list_agents()
    assert len(agents) >= 6
    coder_agents = agent_manager.list_agents(role=AgentRole.CODING)
    assert any("coder" in a.agent_id for a in coder_agents)


def test_agent_wizard_creation_and_lifecycle():
    req = AgentCreateWizardRequest(
        name="Test FinTech Analyst",
        agent_id="agent-fintech-test",
        role=AgentRole.ANALYSIS,
        template_id="tpl-rca",
        primary_model_id="deepseek-reasoner",
        fallback_model_id="qwen-max",
        budget_tokens_per_task=28000,
        permission_level=PermissionLevel.SUPERVISED,
    )
    created = agent_manager.create_agent_wizard(req)
    assert created.agent_id == "agent-fintech-test"
    assert created.primary_model_id == "deepseek-reasoner"
    assert created.status == AgentStatus.ACTIVE

    # Toggle status
    toggled = agent_manager.toggle_agent_status("agent-fintech-test")
    assert toggled.status == AgentStatus.PAUSED

    # Re-toggle
    re_toggled = agent_manager.toggle_agent_status("agent-fintech-test")
    assert re_toggled.status == AgentStatus.ACTIVE

    # Isolated test run
    test_res = agent_manager.test_agent_run("agent-fintech-test", AgentTestRequest(prompt="Analyze transaction spike"))
    assert test_res.ok is True
    assert test_res.tokens_used > 0
    assert test_res.verification_passed is True

    # Delete custom agent
    del_ok = agent_manager.delete_agent("agent-fintech-test")
    assert del_ok is True


# ============================================================================
# 2. Model Hub & Providers Tests
# ============================================================================

def test_provider_presets():
    presets = list_provider_presets()
    ptypes = [p.provider_type for p in presets]
    assert ProviderType.DEEPSEEK in ptypes
    assert ProviderType.QWEN in ptypes
    assert ProviderType.OPENAI in ptypes
    assert ProviderType.GEMINI in ptypes
    assert ProviderType.CLAUDE in ptypes
    assert ProviderType.OLLAMA in ptypes


def test_model_credential_masking():
    req = ModelCreateRequest(
        model_id="custom-corp-gpt",
        provider_type=ProviderType.CUSTOM,
        display_name="Enterprise Private Model",
        api_base="https://ai.corp.internal/v1",
        api_key="sk-live-super-secret-key-9988",
    )
    model = model_hub_manager.add_model(req)
    # Ensure plaintext key is never retained in public model config
    assert model.credential_ref == "sk-****9988"
    assert "super-secret" not in model.credential_ref

    # Clean up
    model_hub_manager.delete_model("custom-corp-gpt")


def test_connection_test_health_check():
    req = ConnectionTestRequest(
        provider_type=ProviderType.DEEPSEEK,
        api_base="https://api.deepseek.com",
        api_key="sk-test-key-mock",
        model_id="deepseek-reasoner",
    )
    res = model_hub_manager.test_connection(req)
    assert res.ok is True
    assert res.latency_ms > 0
    assert "deepseek-reasoner" in res.reported_models


def test_smart_router_modes():
    # 1. Manual mode
    model_router.set_policy(RoutingPolicy(mode=RoutingMode.MANUAL, manual_model_id="claude-3-5-sonnet"))
    m, reason = model_hub_manager.route_task_model(task_type="coding")
    assert m == "claude-3-5-sonnet"
    assert "Manual" in reason

    # 2. Cost-optimized mode
    model_router.set_policy(RoutingPolicy(mode=RoutingMode.COST_OPTIMIZED, cost_threshold_usd_per_m=2.0))
    m, reason = model_hub_manager.route_task_model(task_type="coding")
    assert "Cost-optimized" in reason

    # 3. Auto-complexity mode
    model_router.set_policy(RoutingPolicy(mode=RoutingMode.AUTO_COMPLEXITY))
    m_high, _ = model_hub_manager.route_task_model(task_type="coding", complexity="high")
    assert m_high == "deepseek-reasoner"

    m_std, _ = model_hub_manager.route_task_model(task_type="coding", complexity="low")
    assert m_std == "deepseek-chat"


# ============================================================================
# 3. Usage & Cost Center Tests
# ============================================================================

def test_pricing_calculator():
    # DeepSeek Chat: $0.14 input, $0.28 output per 1M tokens
    cost = compute_usage_cost_usd(
        model_id="deepseek-chat",
        prompt_tokens=1_000_000,
        completion_tokens=1_000_000,
        cached_tokens=0,
    )
    assert cost == pytest.approx(0.42, rel=1e-3)

    # Cached tokens 50% discount
    cost_cached = compute_usage_cost_usd(
        model_id="deepseek-chat",
        prompt_tokens=1_000_000,
        completion_tokens=0,
        cached_tokens=1_000_000,
    )
    assert cost_cached == pytest.approx(0.07, rel=1e-3)


def test_usage_collector_source_separation():
    # Provider reported
    rec1 = usage_collector.record_usage(
        task_id="task-test-src",
        agent_id="agent-coder-core",
        provider_id="deepseek",
        model_id="deepseek-chat",
        prompt_tokens=2000,
        completion_tokens=1000,
        usage_source=UsageSource.PROVIDER_REPORTED,
    )
    assert rec1.usage_source == UsageSource.PROVIDER_REPORTED
    assert rec1.cost_usd > 0

    summary = usage_collector.get_summary()
    assert summary.today_tokens > 0
    assert summary.real_tokens_pct >= 80.0


def test_budget_guard_enforcement():
    # Set aggressive limit to test warning & exhaustion
    test_policy = BudgetPolicy(
        scope=BudgetScope.DAILY_GLOBAL,
        token_limit=10000,
        cost_limit_usd=0.01,
        warning_threshold_pct=50.0,
        on_exhausted=BudgetAction.BLOCK,
    )
    budget_guard.set_policy("daily_global", test_policy)

    res = budget_guard.check_budget()
    assert res.status == "exhausted"
    assert res.allowed is False
    assert res.action == BudgetAction.BLOCK

    # Restore safe global policy
    budget_guard.set_policy(
        "daily_global",
        BudgetPolicy(
            scope=BudgetScope.DAILY_GLOBAL,
            token_limit=1_000_000,
            cost_limit_usd=10.0,
            warning_threshold_pct=80.0,
            on_exhausted=BudgetAction.BLOCK,
        ),
    )


def test_usage_reporting_aggregations():
    rankings = usage_reporter.get_agent_rankings()
    assert len(rankings) > 0
    assert rankings[0].total_tokens >= rankings[-1].total_tokens

    dist = usage_reporter.get_model_distribution()
    assert len(dist) > 0
    total_share = sum(m.share_pct for m in dist)
    assert total_share == pytest.approx(100.0, abs=1.5)

    trends = usage_reporter.get_time_series_trends()
    assert len(trends["days"]) == 7


# ============================================================================
# 4. RESTful API Endpoint Tests
# ============================================================================

def test_api_agents_endpoints(client):
    res = client.get("/api/agents")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 6

    res_tpl = client.get("/api/agents/templates")
    assert res_tpl.status_code == 200
    assert len(res_tpl.json()) >= 6


def test_api_models_endpoints(client):
    res_p = client.get("/api/models/providers")
    assert res_p.status_code == 200
    assert len(res_p.json()) >= 7

    res_m = client.get("/api/models")
    assert res_m.status_code == 200
    assert len(res_m.json()) >= 6

    res_ping = client.post("/api/models/test-connection", json={
        "provider_type": "deepseek",
        "api_base": "https://api.deepseek.com",
        "api_key": "sk-dummy-key",
    })
    assert res_ping.status_code == 200
    assert res_ping.json()["ok"] is True


def test_api_usage_endpoints(client):
    res_s = client.get("/api/usage/summary")
    assert res_s.status_code == 200
    assert "today_tokens" in res_s.json()

    res_r = client.get("/api/usage/by-agent")
    assert res_r.status_code == 200
    assert len(res_r.json()) > 0

    res_m = client.get("/api/usage/by-model")
    assert res_m.status_code == 200
    assert len(res_m.json()) > 0

    res_b = client.get("/api/usage/budget/check")
    assert res_b.status_code == 200
    assert "status" in res_b.json()


def test_api_dashboard_overview(client):
    res = client.get("/api/dashboard/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "system" in data
    assert "kpi" in data
    assert "recent_agent_leaderboard" in data
    assert "model_cost_share" in data
