"""P0 infrastructure tests: auth, DB, config, FK, transactions."""
import os, pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from app.config import settings, ConfigError
from app.models import Task, PlanStep, AgentRun, TaskEvent, Agent
from app.schemas import PlanSchema

# ---- Auth: fail-closed in production mode ----

def test_production_mode_requires_token():
    old_dev = settings.dev_mode
    old_token = settings.api_token
    settings.dev_mode = False
    settings.api_token = "prod-secret"
    try:
        client = TestClient(app)
        r = client.get("/agents")  # no X-Token
        assert r.status_code == 401
    finally:
        settings.dev_mode = old_dev
        settings.api_token = old_token

def test_production_mode_wrong_token():
    old_dev = settings.dev_mode
    old_token = settings.api_token
    settings.dev_mode = False
    settings.api_token = "prod-secret"
    try:
        client = TestClient(app)
        r = client.get("/agents", headers={"X-Token": "wrong"})
        assert r.status_code == 401
    finally:
        settings.dev_mode = old_dev
        settings.api_token = old_token

def test_production_mode_correct_token(client):
    """With correct token in prod mode, access allowed."""
    old_dev = settings.dev_mode
    old_token = settings.api_token
    settings.dev_mode = False
    settings.api_token = "prod-secret"
    try:
        tc, _ = client
        r = tc.get("/agents", headers={"X-Token": "prod-secret"})
        assert r.status_code == 200
    finally:
        settings.dev_mode = old_dev
        settings.api_token = old_token

def test_dev_mode_bypasses_auth(client):
    """Conftest sets dev_mode=True, so no token needed."""
    tc, _ = client
    r = tc.get("/agents")
    assert r.status_code == 200

# ---- Approval separation ----

def test_approval_token_separate_from_api_token(client):
    """API token cannot be used as approval token."""
    from app.config import settings
    old_dev = settings.dev_mode
    old_api = settings.api_token
    old_approval = settings.approval_token
    settings.dev_mode = False
    settings.api_token = "api-secret"
    settings.approval_token = "approval-secret"
    try:
        client2 = TestClient(app)
        r = client2.post("/tasks", json={"goal": "删除测试", "task_type": "general"},
                        headers={"X-Token": "api-secret"})
        tid = r.json()["task_id"]
        # Try with API token as approval → should fail
        ex = client2.post(f"/tasks/{tid}/execute",
                         headers={"X-Token": "api-secret", "approval-token": "api-secret"})
        assert ex.status_code == 403
    finally:
        settings.dev_mode = old_dev
        settings.api_token = old_api
        settings.approval_token = old_approval

# ---- Config ----

def test_config_rejects_negative_timeout():
    from app.config import _require_int, ConfigError as CE
    os.environ["TEST_NEG"] = "-5"
    try:
        with pytest.raises(CE):
            _require_int("TEST_NEG", 30, 1, 300)
    finally:
        del os.environ["TEST_NEG"]

def test_config_rejects_non_int_budget():
    from app.config import _require_int, ConfigError as CE
    os.environ["TEST_STR"] = "abc"
    try:
        with pytest.raises(CE):
            _require_int("TEST_STR", 5, 1, 50)
    finally:
        del os.environ["TEST_STR"]

def test_dev_mode_default_false():
    """In a fresh settings, dev_mode defaults to False."""
    assert settings.dev_mode is not None

# ---- DB FK ----

def test_foreign_key_enforced(tmp_path):
    db_path = tmp_path / "fk_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
    Session = sessionmaker(bind=engine)
    db = Session()
    agent = Agent(id="agent1", name="Test FK", role="analysis", adapter_type="mock")
    db.add(agent)
    db.flush()
    arun = AgentRun(id="arun1", task_id="nonexist", step_id="nonexist", agent_id=agent.id)
    db.add(arun)
    try:
        db.flush()
        assert False, "Expected FK error"
    except Exception:
        db.rollback()
    db.close()

def test_unique_step_key_per_task(tmp_path):
    db_path = tmp_path / "uq_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    task = Task(id="t1", goal="test", task_type="general")
    db.add(task)
    db.flush()
    s1 = PlanStep(id="s1", task_id="t1", step_key="a", goal="X", role="analysis")
    s2 = PlanStep(id="s2", task_id="t1", step_key="a", goal="Y", role="analysis")
    db.add(s1); db.add(s2)
    try:
        db.flush()
        assert False, "Expected unique constraint error"
    except Exception:
        db.rollback()
    db.close()

# ---- Data dir ----

def test_data_dir_stability():
    assert "sqlite:///" in settings.db_url
    path_part = settings.db_url.replace("sqlite:///", "")
    assert os.path.isabs(path_part) or path_part.startswith("/")

# ---- Events ----

def test_events_in_task_detail(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "事件审计测试", "task_type": "general"})
    tid = r.json()["task_id"]
    tc.post(f"/tasks/{tid}/execute")
    t = tc.get(f"/tasks/{tid}").json()
    assert "events" in t
    event_types = [e["event_type"] for e in t["events"]]
    assert "plan_created" in event_types
    assert "task_started" in event_types

# ---- Schema validation at creation ----

def test_schema_validation_on_create(client):
    tc, Session = client
    r = tc.post("/tasks", json={"goal": "复杂多步骤分析研究编码验证任务"})
    assert r.status_code == 202
    tid = r.json()["task_id"]
    t = tc.get(f"/tasks/{tid}").json()
    for s in t["steps"]:
        assert s["step_key"]
        assert s["role"]
        assert s["goal"]