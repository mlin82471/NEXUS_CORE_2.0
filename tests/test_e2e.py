"""End-to-end tests: create task, execute, verify status, steps, events."""
def test_create_task_rule_plan(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "请总结三篇文章的要点", "task_type": "general"})
    assert r.status_code == 202
    data = r.json()
    assert data["status"] == "queued"
    assert data["plan_source"] in ("rule", "model", "direct")
    assert data["steps"] >= 1

def test_get_task_detail(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "研究Python异步编程并给出最佳实践", "task_type": "research"})
    tid = r.json()["task_id"]
    t = tc.get(f"/tasks/{tid}").json()
    assert t["status"] == "queued"
    assert len(t["steps"]) >= 1
    assert "plan_source" in t
    assert "events" in t
    assert "warnings" in t

def test_execute_single_step(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "简单任务测试", "task_type": "general"})
    tid = r.json()["task_id"]
    ex = tc.post(f"/tasks/{tid}/execute")
    assert ex.status_code == 200
    t = tc.get(f"/tasks/{tid}").json()
    assert t["status"] in ("success", "partial")
    assert all(s["status"] in ("success",) for s in t["steps"])

def test_execute_twice_rejected(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "测试重复执行", "task_type": "general"})
    tid = r.json()["task_id"]
    tc.post(f"/tasks/{tid}/execute")
    r2 = tc.post(f"/tasks/{tid}/execute")
    assert r2.status_code == 409

def test_list_tasks(client):
    tc, Session = client
    tc.post("/tasks", json={"goal": "任务1", "task_type": "general"})
    tc.post("/tasks", json={"goal": "任务2", "task_type": "research"})
    tasks = tc.get("/tasks").json()
    assert len(tasks) >= 2

def test_planner_status_no_key(client):
    tc, Session = client
    s = tc.get("/planner/status").json()
    assert "available" in s
    assert isinstance(s["available"], bool)

def test_health(client):
    tc, Session = client
    assert tc.get("/health").json()["status"] == "ok"

def test_agents_list(client):
    tc, Session = client
    agents = tc.get("/agents").json()
    assert len(agents) >= 6
    roles = {a["role"] for a in agents}
    assert roles >= {"research", "coding", "analysis", "knowledge", "execution", "verification"}

def test_register_agent(client):
    tc, Session = client
    r = tc.post("/agents/register", json={
        "name": "Custom Agent", "role": "research", "adapter_type": "mock", "description": "test"
    })
    assert r.status_code == 200
    assert r.json()["name"] == "Custom Agent"

def test_register_duplicate_rejected(client):
    tc, Session = client
    tc.post("/agents/register", json={"name": "TestDup", "role": "coding"})
    r2 = tc.post("/agents/register", json={"name": "TestDup", "role": "analysis"})
    assert r2.status_code == 409

def test_get_task_events(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "事件测试", "task_type": "general"})
    tid = r.json()["task_id"]
    tc.post(f"/tasks/{tid}/execute")
    events = tc.get(f"/tasks/{tid}/events").json()
    assert len(events) >= 2

# ---- P0 security tests ----

def test_task_creation_atomic(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "原子性测试", "task_type": "general"})
    assert r.status_code == 202
    tid = r.json()["task_id"]
    t = tc.get(f"/tasks/{tid}").json()
    assert len(t["steps"]) >= 1
    assert len(t["events"]) >= 1

def test_high_risk_rejected_without_approval(client):
    """High-risk keyword '删除' triggers server risk=high, no approval → 403."""
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "请删除所有数据库记录", "task_type": "general"})
    assert r.status_code == 202
    tid = r.json()["task_id"]
    assert r.json()["risk_level"] == "high"
    ex = tc.post(f"/tasks/{tid}/execute")
    assert ex.status_code == 403

def test_high_risk_with_approval(client):
    """Set approval token, provide it → should execute."""
    from app.config import settings
    old = settings.approval_token
    settings.approval_token = "approve-me"
    try:
        tc, Session = client
        r = tc.post("/tasks", json={"goal": "删除临时文件", "task_type": "general"})
        tid = r.json()["task_id"]
        ex = tc.post(f"/tasks/{tid}/execute", headers={"approval-token": "approve-me"})
        assert ex.status_code == 200
    finally:
        settings.approval_token = old

def test_client_cannot_deescalate_risk(client):
    """Client sets risk_suggestion=low but goal contains 'delete' → server overrides to high."""
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "delete all records", "risk_suggestion": "low"})
    assert r.json()["risk_level"] == "high"

def test_unknown_role_rejected(client):
    tc, Session = client
    r = tc.post("/agents/register", json={
        "name": "BadRole", "role": "superhero", "adapter_type": "mock"
    })
    assert r.status_code == 422

def test_unknown_adapter_rejected(client):
    tc, Session = client
    r = tc.post("/agents/register", json={
        "name": "BadAdapter", "role": "coding", "adapter_type": "magic"
    })
    assert r.status_code == 422

def test_dsh_register_blocked_when_disabled(client):
    tc, Session = client
    r = tc.post("/agents/register", json={
        "name": "BlockedDSH", "role": "coding", "adapter_type": "dsh"
    })
    assert r.status_code == 403
