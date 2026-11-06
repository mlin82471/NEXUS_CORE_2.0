"""
NEXUS CORE 2.1 — Model Arena Benchmark Unit Tests (§TEST-ARENA).
Validates multi-model empirical comparison, winner determinations,
quality scoring with IndependentEvaluator, and empirical ranking aggregation.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.benchmark.arena import model_arena_engine, ModelArenaEngine


@pytest.fixture
def client():
    return TestClient(app)


def test_arena_engine_execution():
    engine = ModelArenaEngine()
    candidates = ["deepseek-chat", "deepseek-reasoner", "qwen-plus"]
    
    report = engine.run_arena(
        goal="编写快速排序算法并测试边界空列表",
        candidate_models=candidates,
        task_type="coding",
    )

    assert report.arena_id.startswith("arena-")
    assert len(report.results) == 3
    assert report.winner_overall in candidates
    assert report.winner_cost in candidates
    assert report.winner_speed in candidates
    assert report.winner_quality in candidates

    # Verification passed for code
    for res in report.results:
        assert res.total_tokens > 0
        assert res.cost_usd > 0
        assert res.latency_ms > 0
        assert res.verification_passed is True
        assert res.quality_score >= 0.8


def test_arena_rankings_aggregation():
    engine = ModelArenaEngine()
    engine.run_arena(
        goal="计算哈希环的一致性哈希分布",
        candidate_models=["deepseek-chat", "qwen-plus"],
    )
    rankings = engine.get_empirical_rankings()
    assert len(rankings) >= 2
    for r in rankings:
        assert "win_rate_pct" in r
        assert r["matches"] >= 1


def test_arena_api_endpoints(client):
    res_run = client.post("/api/benchmark/arena", json={
        "goal": "编写双指针去重算法",
        "candidate_models": ["deepseek-chat", "deepseek-reasoner"],
        "task_type": "coding",
    })
    assert res_run.status_code == 200
    data = res_run.json()
    assert "winner_overall" in data
    assert len(data["results"]) == 2

    res_hist = client.get("/api/benchmark/arena/history")
    assert res_hist.status_code == 200
    assert len(res_hist.json()) > 0

    res_ranks = client.get("/api/benchmark/arena/rankings")
    assert res_ranks.status_code == 200
    assert len(res_ranks.json()) > 0
