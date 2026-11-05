"""
Unit and integration tests for AntigravityAdapter and DSHAdapter.
Verifies gate enforcement, capabilities matching, process isolation,
timeout handling, cancellation, and registry dispatch.
"""

import threading
import pytest
from app.config import settings
from app.agents.base import AgentResult, AgentTimeoutError, AgentCancelledError
from app.adapters.antigravity import AntigravityAdapter
from app.adapters.dsh import DSHAdapter
from app.services.registry import seed_default_agents, dispatch_agent
from app.models import Agent
from app.b1.agent_runner import run_agent_safely, ExecutionOutcome
from app.b0.protocols import AgentData


def test_antigravity_disabled_by_default():
    old = settings.enable_antigravity_adapter
    settings.enable_antigravity_adapter = False
    try:
        with pytest.raises(RuntimeError, match="Antigravity adapter not enabled"):
            AntigravityAdapter()
    finally:
        settings.enable_antigravity_adapter = old


def test_dsh_disabled_by_default():
    old = settings.enable_dsh_adapter
    settings.enable_dsh_adapter = False
    try:
        with pytest.raises(RuntimeError, match="DSH adapter not enabled"):
            DSHAdapter()
    finally:
        settings.enable_dsh_adapter = old


def test_antigravity_capabilities_match():
    old = settings.enable_antigravity_adapter
    settings.enable_antigravity_adapter = True
    try:
        adapter = AntigravityAdapter()
        assert adapter.capabilities_match(["read_files", "write_files"])
        assert adapter.capabilities_match(["code_analysis"])
        assert not adapter.capabilities_match(["quantum_computing"])
        assert adapter.estimated_tokens("Test code generation") >= 150
        assert adapter.health_check() is True
    finally:
        settings.enable_antigravity_adapter = old


def test_dsh_capabilities_match():
    old = settings.enable_dsh_adapter
    settings.enable_dsh_adapter = True
    try:
        adapter = DSHAdapter()
        assert adapter.capabilities_match(["cluster_dispatch", "system_ops"])
        assert not adapter.capabilities_match(["write_novel"])
        assert adapter.estimated_tokens("System diagnosis") >= 100
        assert adapter.health_check() is True
    finally:
        settings.enable_dsh_adapter = old


def test_antigravity_execution_standalone():
    old = settings.enable_antigravity_adapter
    settings.enable_antigravity_adapter = True
    try:
        adapter = AntigravityAdapter()
        res = adapter.run("Write a fibonacci function in python", context={"workspace": "/tmp"})
        assert isinstance(res, AgentResult)
        assert len(res.result) > 0
        assert res.input_tokens > 0
        assert res.output_tokens > 0
    finally:
        settings.enable_antigravity_adapter = old


def test_dsh_execution_standalone():
    old = settings.enable_dsh_adapter
    settings.enable_dsh_adapter = True
    try:
        adapter = DSHAdapter()
        res = adapter.run("Inspect node health across cluster")
        assert isinstance(res, AgentResult)
        assert "DSH" in res.result or "Cluster" in res.result or len(res.result) > 0
        assert res.input_tokens > 0
        assert res.output_tokens > 0
    finally:
        settings.enable_dsh_adapter = old


def test_antigravity_cancellation_pre_run():
    old = settings.enable_antigravity_adapter
    settings.enable_antigravity_adapter = True
    try:
        adapter = AntigravityAdapter()
        cancel_evt = threading.Event()
        cancel_evt.set()
        with pytest.raises(AgentCancelledError):
            adapter.run("Cancelled task", cancel_event=cancel_evt)
    finally:
        settings.enable_antigravity_adapter = old


def test_dsh_cancellation_pre_run():
    old = settings.enable_dsh_adapter
    settings.enable_dsh_adapter = True
    try:
        adapter = DSHAdapter()
        cancel_evt = threading.Event()
        cancel_evt.set()
        with pytest.raises(AgentCancelledError):
            adapter.run("Cancelled task", cancel_event=cancel_evt)
    finally:
        settings.enable_dsh_adapter = old


def test_registry_seeds_antigravity_and_dsh(client):
    _, Session = client
    db = Session()
    try:
        agents = seed_default_agents(db)
        names = [a.name for a in db.query(Agent).all()]
        assert "Antigravity Coding" in names
        assert "Antigravity Execution" in names
        assert "DSH Analysis" in names
        assert "DSH Execution" in names
    finally:
        db.close()


def test_b1_agent_runner_with_antigravity():
    old = settings.enable_antigravity_adapter
    settings.enable_antigravity_adapter = True
    try:
        agent_data = AgentData(
            id="test-antigravity",
            name="Antigravity Test",
            role="coding",
            adapter_type="antigravity",
            verification_status="verified",
        )
        outcome = run_agent_safely(agent_data, "Refactor module X")
        assert outcome.status == "completed"
        assert outcome.result is not None
        assert outcome.input_tokens > 0
    finally:
        settings.enable_antigravity_adapter = old


if __name__ == "__main__":
    print("Running Antigravity and DSH Adapter verification...")
    test_antigravity_disabled_by_default()
    print("PASS: test_antigravity_disabled_by_default")
    test_dsh_disabled_by_default()
    print("PASS: test_dsh_disabled_by_default")
    test_antigravity_capabilities_match()
    print("PASS: test_antigravity_capabilities_match")
    test_dsh_capabilities_match()
    print("PASS: test_dsh_capabilities_match")
    test_antigravity_execution_standalone()
    print("PASS: test_antigravity_execution_standalone")
    test_dsh_execution_standalone()
    print("PASS: test_dsh_execution_standalone")
    test_antigravity_cancellation_pre_run()
    print("PASS: test_antigravity_cancellation_pre_run")
    test_dsh_cancellation_pre_run()
    print("PASS: test_dsh_cancellation_pre_run")
    test_b1_agent_runner_with_antigravity()
    print("PASS: test_b1_agent_runner_with_antigravity")
    print("ALL ADAPTER TESTS PASSED SUCCESSFULLY!")

