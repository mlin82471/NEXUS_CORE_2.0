"""
Tests for Autonomous Evolution Sweeper.
Validates:
1. Sweeper Lifecycle (start, stop, status).
2. Autonomous sweep execution: telemetry analysis -> sandbox verification -> pending_approval queue.
3. FastAPI Endpoints for on-demand trigger and status inspection.
"""
import pytest
from app.evolution.sweeper import AutonomousEvolutionSweeper, sweeper
from app.models import Agent, Task
from app.router.metrics import record_agent_execution


def test_sweeper_lifecycle():
    sw = AutonomousEvolutionSweeper(interval_seconds=10, enabled=True)
    assert not sw.get_status()["is_running"]
    sw.start()
    assert sw.get_status()["is_running"]
    status = sw.get_status()
    assert status["enabled"] is True
    assert status["interval_seconds"] == 10
    sw.stop()
    assert not sw.get_status()["is_running"]


def test_sweeper_execute_sweep(client):
    tc, Session = client
    db = Session()
    try:
        # Create an agent with high failure rate to trigger an evolution proposal
        agent = db.query(Agent).filter_by(role="analysis").first()
        if not agent:
            agent = Agent(name="analysis_agent", role="analysis", adapter_type="mock")
            db.add(agent)
            db.commit()

        # Seed failures
        for _ in range(5):
            record_agent_execution(db, agent.id, status="failed", input_tokens=1000, output_tokens=500, execution_time_ms=2000)

        sw = AutonomousEvolutionSweeper(interval_seconds=60, enabled=True)
        result = sw.execute_sweep(db)

        assert result["sweep_id"] == 1
        assert "timestamp" in result
        assert result["duration_seconds"] >= 0
        assert result["new_proposals_found"] >= 1
        assert result["verified_pending_approval"] >= 1

        # Check status
        st = sw.get_status()
        assert st["total_sweeps"] == 1
        assert st["last_sweep_result"] is not None
    finally:
        db.close()


def test_sweeper_api_endpoints(client):
    tc, Session = client
    # 1. Trigger sweep via API
    resp = tc.post("/evolution/sweeper/trigger")
    assert resp.status_code == 200
    data = resp.json()
    assert "sweep_id" in data
    assert "duration_seconds" in data

    # 2. Get status via API
    resp_st = tc.get("/evolution/sweeper/status")
    assert resp_st.status_code == 200
    st_data = resp_st.json()
    assert "enabled" in st_data
    assert "total_sweeps" in st_data
    assert st_data["total_sweeps"] >= 1
