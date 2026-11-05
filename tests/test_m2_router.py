"""
Unit and Integration Tests for M2: Intelligent Scheduling, Task Classifier,
Dynamic Model Routing, Agent Performance Metrics & A/B Benchmark Comparator.
"""
import pytest
from app.router.classifier import classify_task, TaskComplexity
from app.router.model_router import route_model, ModelTier
from app.router.metrics import record_agent_execution, get_agent_metrics
from app.benchmark.comparator import run_ab_comparison
from app.models import Agent, Task
from app.database import SessionLocal


def test_task_classification_simple():
    c1 = classify_task("计算 123 * 456 + 789")
    assert c1.complexity == TaskComplexity.SIMPLE
    assert not c1.needs_multi_agent
    assert c1.suggested_max_steps == 1
    assert c1.suggested_max_agents == 1

    c2 = classify_task("法国的首都是哪里？")
    assert c2.complexity == TaskComplexity.SIMPLE
    assert not c2.needs_multi_agent

    c3 = classify_task("hello")
    assert c3.complexity == TaskComplexity.SIMPLE


def test_task_classification_single_expert():
    c = classify_task("编写一个Python快速排序算法", task_type="coding")
    assert c.complexity == TaskComplexity.SINGLE_EXPERT
    assert c.primary_role == "coding"
    assert "verification" in c.required_roles
    assert c.suggested_max_steps == 2
    assert c.suggested_max_agents == 2


def test_task_classification_complex():
    c = classify_task(
        "研究并开发一套分布式任务分发调度系统，比较不同架构方案并提供完整单元测试与压测报告",
        task_type="research",
    )
    assert c.complexity == TaskComplexity.COMPLEX
    assert c.needs_multi_agent is True
    assert c.suggested_max_parallel <= 3
    assert c.suggested_max_agents <= 3
    assert c.suggested_max_steps <= 5
    assert c.suggested_max_replans == 1


def test_model_routing_tiers():
    # Simple task routes to fast model
    d_simple = route_model("计算公式", TaskComplexity.SIMPLE, role="analysis")
    assert d_simple.model_tier == ModelTier.FAST

    # Coding expert routes to coder model
    d_code = route_model("实现二叉搜索树", TaskComplexity.SINGLE_EXPERT, role="coding")
    assert d_code.model_tier == ModelTier.CODER

    # Complex routes to reasoning model
    d_complex = route_model("全链路架构设计与开发", TaskComplexity.COMPLEX, role="research")
    assert d_complex.model_tier == ModelTier.REASONING

    # Low budget emergency fallback (< 5000 tokens)
    d_low_budget = route_model(
        "复杂任务分析",
        TaskComplexity.COMPLEX,
        role="analysis",
        remaining_budget_tokens=3000,
    )
    assert d_low_budget.model_tier == ModelTier.FAST
    assert "Budget conservation" in d_low_budget.reason


def test_agent_metrics_tracking(client):
    tc, Session = client
    db = Session()
    agent = db.query(Agent).first()
    assert agent is not None

    record_agent_execution(db, agent.id, "success", 100, 200, 150)
    record_agent_execution(db, agent.id, "failed", 50, 0, 50)

    metrics = get_agent_metrics(db)
    target = next(m for m in metrics if m["agent_id"] == agent.id)
    telemetry = target["telemetry"]
    assert telemetry["total_calls"] == 2
    assert telemetry["success_calls"] == 1
    assert telemetry["failed_calls"] == 1
    assert telemetry["total_input_tokens"] == 150
    assert telemetry["total_output_tokens"] == 200
    assert telemetry["success_rate"] == 0.5
    db.close()


def test_ab_comparator_simple_task(client):
    tc, Session = client
    db = Session()
    report = run_ab_comparison("计算 2+2 的结果", "general", db)
    db.close()

    assert report.complexity == TaskComplexity.SIMPLE
    assert report.recommendation == "use_single_agent"
    assert "Simple task detected" in report.reason
    assert report.single_agent.steps_count == 1
    assert report.token_multiplier >= 1.0


def test_api_m2_endpoints(client):
    tc, Session = client

    # 1. Classify Endpoint
    r1 = tc.post("/router/classify", json={"goal": "编写并测试快速排序算法", "task_type": "coding"})
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["classification"]["complexity"] == "single_expert"
    assert d1["routing"]["model_tier"] == "coder"

    # 2. Benchmark Compare Endpoint
    r2 = tc.post("/benchmark/compare", json={"goal": "计算 1+1", "task_type": "general"})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["recommendation"] == "use_single_agent"
    assert d2["single_agent"]["status"] == "success"

    # 3. Agent Metrics Endpoint
    r3 = tc.get("/metrics/agents")
    assert r3.status_code == 200
    assert isinstance(r3.json(), list)

    # 4. Simple Task Single Agent Bypass in /tasks
    r4 = tc.post("/tasks", json={"goal": "计算 1+1", "task_type": "general"})
    assert r4.status_code == 202
    t4 = r4.json()
    assert t4["complexity"] == "simple"
    assert t4["steps"] == 1
    assert t4["plan_source"] == "direct"
