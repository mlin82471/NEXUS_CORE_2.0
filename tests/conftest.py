import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from app.config import settings
from app.services.registry import seed_default_agents

@pytest.fixture(autouse=True)
def _test_env_defaults(monkeypatch):
    """Ensure test suite runs deterministic and fast offline by default."""
    monkeypatch.setattr(settings, "dev_mode", True)
    monkeypatch.setattr(settings, "planner_api_key", "")
    monkeypatch.setattr(settings, "enable_hermes_adapter", False)
    monkeypatch.setattr(settings, "enable_dsh_adapter", False)
    monkeypatch.setattr(settings, "enable_antigravity_adapter", False)

@pytest.fixture
def client(tmp_path):
    """TestClient with isolated SQLite."""
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    with engine.connect() as c:
        c.execute(text("PRAGMA journal_mode=WAL"))
        c.execute(text("PRAGMA foreign_keys=ON"))
        c.commit()
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    def override():
        db = Session()
        try: yield db
        finally: db.close()
    app.dependency_overrides[get_db] = override
    db = Session()
    seed_default_agents(db)
    db.close()
    from fastapi.testclient import TestClient
    from app.services.worker_pool import set_session_factory
    set_session_factory(Session)
    tc = TestClient(app)
    yield tc, Session
    set_session_factory(None)
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    app.dependency_overrides.clear()
