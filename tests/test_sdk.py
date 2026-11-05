"""
Tests for NEXUS CORE 2.0 Developer SDK and custom agent registration.
Validates:
1. @nexus_agent decorator registration.
2. NexusAgent subclass registration.
3. Cancellation event propagation.
4. Token estimation and output serialization.
"""
import threading
import pytest
from app.sdk import nexus_agent, NexusAgent, register_custom_agent, FunctionAgentAdapter
from app.services.registry import get_custom_agent_instance, dispatch_agent
from app.models import Agent


def test_decorator_registration():
    @nexus_agent(
        name="TestCalcAgent",
        role="coding",
        description="Math calculation agent",
        capabilities=["math_eval"]
    )
    def calculate(goal: str, cancel_event=None) -> str:
        return f"Calculated: {goal}"

    agent_inst = get_custom_agent_instance("TestCalcAgent")
    assert agent_inst is not None
    assert agent_inst.role == "coding"
    assert "math_eval" in agent_inst.capabilities

    res = agent_inst.run("1 + 1 = ?")
    assert "Calculated: 1 + 1 = ?" in res.result
    assert res.input_tokens > 0
    assert res.output_tokens > 0


def test_class_registration():
    class CustomSearchAgent(NexusAgent):
        name = "TestSearchAgent"
        role = "research"
        description = "Custom searcher"
        capabilities = ["web_search"]

        def execute(self, goal: str, cancel_event=None):
            return {"results": [f"Result for {goal}"]}

    register_custom_agent(CustomSearchAgent())
    agent_inst = get_custom_agent_instance("TestSearchAgent")
    assert agent_inst is not None

    res = agent_inst.run("Search latest AI news")
    assert "Result for Search latest AI news" in res.result


def test_agent_cancellation():
    class SlowAgent(NexusAgent):
        name = "SlowAgent"
        role = "execution"
        def execute(self, goal: str, cancel_event=None):
            return "finished"

    inst = SlowAgent()
    cancel_evt = threading.Event()
    cancel_evt.set()

    res = inst.run("Run long job", cancel_event=cancel_evt)
    assert "[CANCELLED]" in res.result
    assert res.usage_source == "cancelled"


def test_custom_agent_db_dispatch(client):
    tc, Session = client
    db = Session()
    try:
        # Create custom agent record in test DB
        agent_rec = Agent(
            name="DbBoundCustomAgent",
            role="analysis",
            adapter_type="custom",
            enabled=True
        )
        db.add(agent_rec)
        db.commit()

        # Register instance in SDK
        @nexus_agent(name="DbBoundCustomAgent", role="analysis")
        def db_agent_logic(goal: str):
            return "Handled by custom instance"

        # Dispatch via scheduler registry
        dispatched = dispatch_agent(agent_rec)
        res = dispatched.run("Analyze test data")
        assert res.result == "Handled by custom instance"
    finally:
        db.close()


def test_custom_agent_api(client):
    tc, Session = client
    resp = tc.post("/agents/custom", json={
        "name": "ApiRegisteredAgent",
        "role": "coding",
        "description": "Registered via REST API",
        "capabilities": ["code_gen", "write_files"]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "ApiRegisteredAgent"
    assert data["adapter_type"] == "custom"
    assert data["status"] == "registered"

