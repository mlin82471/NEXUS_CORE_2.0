"""
Tests for Hybrid Semantic Vector Retriever and RRF Fusion.
Validates:
1. Deterministic embedding calculation and L2 normalization.
2. Cosine similarity calculations.
3. Hybrid Search over TaskExperience with RRF (Reciprocal Rank Fusion).
4. FastAPI POST /memory/search/hybrid endpoint.
"""
import pytest
from app.memory.vector_retriever import (
    _compute_deterministic_embedding,
    cosine_similarity,
    hybrid_search_experiences
)
from app.models import TaskExperience


def test_deterministic_embedding():
    text1 = "高并发 LRU 缓存设计与淘汰策略"
    text2 = "高并发 LRU 缓存设计与淘汰策略"
    text3 = "微服务金丝雀发布与健康探针"

    v1 = _compute_deterministic_embedding(text1)
    v2 = _compute_deterministic_embedding(text2)
    v3 = _compute_deterministic_embedding(text3)

    assert len(v1) == 256
    # Exact match must yield 1.0 cosine similarity
    assert abs(cosine_similarity(v1, v2) - 1.0) < 1e-4

    # Similar text should have positive similarity, different text lower
    sim_diff = cosine_similarity(v1, v3)
    assert sim_diff < 0.8


def test_hybrid_search_experiences(client):
    tc, Session = client
    db = Session()
    try:
        # Seed test experiences
        exp1 = TaskExperience(
            task_id="task_lru_1",
            goal="设计并实现高并发分布式 LRU 缓存引擎",
            task_type="coding",
            complexity="COMPLEX",
            status="success",
            lessons_learned="使用分段读写锁可以有效降低热点键争用",
            plan_summary=[{"step": "s1", "role": "coding"}],
            token_cost=3200,
            execution_time_s=1.2
        )
        exp2 = TaskExperience(
            task_id="task_sec_2",
            goal="分析支付流水对账与防篡改签名校验",
            task_type="analysis",
            complexity="COMPLEX",
            status="failed",
            failure_reasons=[{"cause": "HASH_MISMATCH", "detail": "SHA-256存证校验和不一致"}],
            lessons_learned="在对比哈希前需要保证 JSON 序列化符合 RFC 8785 规范",
            plan_summary=[{"step": "s1", "role": "analysis"}],
            token_cost=2100,
            execution_time_s=0.9
        )
        db.add_all([exp1, exp2])
        db.commit()

        # Hybrid query matching exp1
        results = hybrid_search_experiences(db, "并发缓存淘汰与锁机制", top_k=5)
        assert len(results) >= 1
        assert results[0]["task_id"] == "task_lru_1"
        assert results[0]["cosine_similarity"] > 0
        assert "rrf_score" in results[0]

        # Hybrid query matching exp2
        results_sec = hybrid_search_experiences(db, "JSON 存证签名与对账核算", top_k=5)
        assert len(results_sec) >= 1
        assert results_sec[0]["task_id"] == "task_sec_2"
    finally:
        db.close()


def test_hybrid_search_api(client):
    tc, Session = client
    resp = tc.post("/memory/search/hybrid", json={"query": "高并发缓存", "top_k": 3})
    assert resp.status_code == 200
    data = resp.json()
    assert "query" in data
    assert "results" in data
    assert isinstance(data["results"], list)
