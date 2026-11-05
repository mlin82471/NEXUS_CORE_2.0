"""
Unit and Integration Tests for M3: Long-term Memory & Continuous Learning System.
Verifies Experience Distillation, Failure RCA, Knowledge Retention, and Memory-Augmented Retrieval.
"""
import pytest
from app.models import Task, PlanStep, TaskExperience, KnowledgeItem, AgentRun, Agent
from app.memory.distiller import distill_task_experience, _classify_failure_cause
from app.memory.retriever import retrieve_relevant_memory, _extract_keywords
from app.memory.knowledge import save_knowledge_snippet, list_knowledge_items


def test_failure_rca_classification():
    assert "TIMEOUT" in _classify_failure_cause("Antigravity execution exceeded 120s wall-clock limit")
    assert "PERMISSION_DENIED" in _classify_failure_cause("Permission denied: Agent lacked write_files")
    assert "ADAPTER_UNAVAILABLE" in _classify_failure_cause("Cannot acquire agent: ImportError")
    assert "UPSTREAM_FAILURE" in _classify_failure_cause("Upstream step 's1' not completed")
    assert "BUDGET_EXHAUSTED" in _classify_failure_cause("Step exceeds max_steps=5")
    assert "PLAN_DEFECT" in _classify_failure_cause("DAG cycle detected between s1 and s2")


def test_distill_successful_task(client):
    tc, Session = client
    db = Session()

    task = Task(
        goal="编写并测试一个斐波那契数列生成器",
        task_type="coding",
        status="success",
        result="```python\ndef fib(n):\n    return n\n```",
    )
    db.add(task)
    db.flush()

    s1 = PlanStep(
        task_id=task.id, step_key="s1", title="Coding",
        goal="实现斐波那契", role="coding", status="success",
        result="```python\ndef fib(n):\n    return n\n```"
    )
    db.add(s1)
    db.flush()

    agent = db.query(Agent).first()
    assert agent is not None

    arun = AgentRun(
        task_id=task.id, step_id=s1.id, agent_id=agent.id,
        status="success", input_tokens=100, output_tokens=150
    )
    db.add(arun)
    db.commit()

    exp = distill_task_experience(db, task)
    assert exp is not None
    assert exp.status == "success"
    assert "SUCCESSFUL PATTERN" in exp.lessons_learned
    assert exp.token_cost == 250
    assert len(exp.failure_reasons) == 0

    # Knowledge snippet auto-extracted
    k = db.query(KnowledgeItem).filter(KnowledgeItem.source_task_id == task.id).first()
    assert k is not None
    assert "def fib" in k.content
    assert k.category == "code_snippet"

    db.close()


def test_distill_failed_task_rca(client):
    tc, Session = client
    db = Session()

    task = Task(
        goal="部署高可用 Redis 集群",
        task_type="execution",
        status="failed",
    )
    db.add(task)
    db.flush()

    s1 = PlanStep(
        task_id=task.id, step_key="s1", title="Cluster Init",
        goal="连接集群主机", role="execution", status="failed",
        error="DSH execution exceeded 60s wall-clock limit"
    )
    db.add(s1)
    db.commit()

    exp = distill_task_experience(db, task)
    assert exp.status == "failed"
    assert len(exp.failure_reasons) == 1
    assert "TIMEOUT" in exp.failure_reasons[0]
    assert "FAILURE WARNING" in exp.lessons_learned
    db.close()


def test_memory_retrieval(client):
    tc, Session = client
    db = Session()

    # Seed 1 success experience and 1 failure experience
    t_succ = Task(goal="快速排序算法开发与优化", task_type="coding", status="success")
    t_fail = Task(goal="快速排序高并发极端输入压测", task_type="coding", status="failed")
    db.add_all([t_succ, t_fail])
    db.flush()

    s_fail = PlanStep(
        task_id=t_fail.id, step_key="s1", title="Stress Test",
        goal="运行百万级数据", role="verification", status="failed",
        error="Permission denied: Agent lacked execute_cmd"
    )
    db.add(s_fail)
    db.commit()

    distill_task_experience(db, t_succ)
    distill_task_experience(db, t_fail)

    # Now retrieve memory for a new task about 快速排序
    mem = retrieve_relevant_memory(db, "用 Python 实现快速排序")
    assert mem.has_memory is True
    assert len(mem.best_practice_hints) >= 1
    assert any("SUCCESSFUL PATTERN" in bp for bp in mem.best_practice_hints)
    assert len(mem.failure_warnings) >= 1
    assert any("PERMISSION_DENIED" in fw for fw in mem.failure_warnings)
    assert "### 🧠 历史成功经验" in mem.prompt_injection
    assert "### ⚠️ 历史踩坑与失败预警" in mem.prompt_injection

    db.close()


def test_knowledge_crud(client):
    tc, Session = client
    db = Session()

    k1 = save_knowledge_snippet(
        db=db,
        key="fastapi_cors_template",
        content="app.add_middleware(CORSMiddleware, allow_origins=['*'])",
        category="code_snippet",
        tags=["fastapi", "cors", "web"]
    )
    assert k1.id is not None
    assert k1.usage_count == 1

    # Update increments count
    k2 = save_knowledge_snippet(
        db=db,
        key="fastapi_cors_template",
        content="app.add_middleware(CORSMiddleware, allow_origins=['*'])",
    )
    assert k2.usage_count == 2

    items = list_knowledge_items(db, category="code_snippet")
    assert len(items) >= 1
    assert items[0]["key"] == "fastapi_cors_template"

    db.close()


def test_api_m3_endpoints(client):
    tc, Session = client

    # 1. Experiences list endpoint
    r1 = tc.get("/memory/experiences")
    assert r1.status_code == 200
    assert isinstance(r1.json(), list)

    # 2. Knowledge list endpoint
    r2 = tc.get("/memory/knowledge")
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)

    # 3. Memory Search endpoint
    r3 = tc.post("/memory/search", json={"goal": "快速排序实现", "task_type": "coding"})
    assert r3.status_code == 200
    d3 = r3.json()
    assert "has_memory" in d3
    assert "best_practice_hints" in d3
    assert "failure_warnings" in d3
