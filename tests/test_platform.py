"""
Unit & Integration Tests for NEXUS CORE 2.1 Shared Platform Infrastructure (§Platform).
Validates:
1. Workspace isolation and cleanup.
2. Evidence creation, cryptographic hashing, and tampering detection.
3. Authoritative server-side policy risk classification (L0 to L3).
4. Human approval gate lifecycle and execution permissions.
5. CAS versioned runtime configuration and atomic rollback.
"""

import tempfile
from pathlib import Path
import pytest

from app.platform.workspace import WorkspaceManager
from app.platform.evidence import EvidenceEngine, EvidenceType
from app.platform.policy import PolicyEngine, RiskLevel
from app.platform.approval import (
    ApprovalGate,
    ApprovalStatus,
    UnauthorizedOperationError,
)
from app.platform.runtime_config import ConfigConflictError, RuntimeConfigManager


def test_workspace_isolation_and_cleanup(tmp_path):
    # Setup a mock base repository
    base_repo = tmp_path / "base_project"
    base_repo.mkdir()
    (base_repo / "main.py").write_text("print('hello baseline')", encoding="utf-8")

    ws_storage = tmp_path / "workspaces"
    mgr = WorkspaceManager(storage_root=ws_storage)

    # Create workspace
    ws = mgr.create_workspace(
        task_id="task-123456",
        base_repo_path=base_repo,
        use_git_worktree=False,
    )
    assert ws.workspace_path.exists()
    assert (ws.workspace_path / "main.py").exists()

    # Modify file in workspace
    (ws.workspace_path / "main.py").write_text("print('hello modified')", encoding="utf-8")
    (ws.workspace_path / "new_feature.py").write_text("# new feature", encoding="utf-8")

    # Assert baseline is unchanged
    assert (base_repo / "main.py").read_text(encoding="utf-8") == "print('hello baseline')"
    assert not (base_repo / "new_feature.py").exists()

    # Cleanup
    assert mgr.cleanup_workspace(ws.workspace_id) is True
    assert not ws.workspace_path.exists()


def test_evidence_hashing_and_tamper_detection():
    engine = EvidenceEngine()

    # Record test execution
    ev = engine.record_test_run(
        task_id="t-100",
        agent_id="test-agent",
        test_command="pytest -q tests",
        exit_code=0,
        passed_count=10,
        failed_count=0,
        stdout_tail="10 passed",
    )
    assert ev.evidence_id.startswith("ev-")
    assert ev.fingerprint is not None

    # Integrity verification
    verification = engine.verify_evidence_package("t-100")
    assert verification["valid"] is True
    assert verification["count"] == 1
    assert EvidenceType.TEST_EXECUTION.value in verification["evidence_types"]

    # Tamper with raw data in payload
    ev.payload["data"]["passed"] = 999
    tampered_verification = engine.verify_evidence_package("t-100")
    assert tampered_verification["valid"] is False


def test_policy_risk_classification():
    policy = PolicyEngine()

    # L0 Read / Diagnose
    assert policy.evaluate_risk(action_type="read_file", target_path="app/main.py") == RiskLevel.L0_READ_ONLY
    assert policy.evaluate_risk(action_type="metrics_query") == RiskLevel.L0_READ_ONLY

    # L1 Reversible
    assert policy.evaluate_risk(action_type="write_file", target_path="app/test.py") == RiskLevel.L1_REVERSIBLE
    assert policy.evaluate_risk(action_type="run_test") == RiskLevel.L1_REVERSIBLE

    # L2 Service / Config
    assert policy.evaluate_risk(action_type="service_restart") == RiskLevel.L2_SERVICE_CONFIG
    assert policy.evaluate_risk(action_type="custom", command="systemctl restart app") == RiskLevel.L2_SERVICE_CONFIG
    assert policy.evaluate_risk(action_type="custom", command="pip install requests") == RiskLevel.L2_SERVICE_CONFIG

    # L3 Destructive
    assert policy.evaluate_risk(action_type="custom", command="rm -rf /tmp/data") == RiskLevel.L3_DESTRUCTIVE
    assert policy.evaluate_risk(action_type="custom", command="DROP TABLE users;") == RiskLevel.L3_DESTRUCTIVE
    assert policy.evaluate_risk(action_type="write_file", target_path=".git/config") == RiskLevel.L3_DESTRUCTIVE
    assert policy.evaluate_risk(action_type="write_file", target_path=".env") == RiskLevel.L3_DESTRUCTIVE


def test_approval_gate_lifecycle():
    gate = ApprovalGate()

    # 1. L0 Action -> auto approved
    req_l0 = gate.request_approval(
        task_id="t-1",
        requester_agent_id="agent-0",
        action_type="read_file",
        description="Inspect codebase",
        payload={"path": "main.py"},
    )
    assert req_l0.status == ApprovalStatus.APPROVED
    assert gate.verify_execution_permission(req_l0.request_id) is True

    # 2. L2 Action -> pending human approval
    req_l2 = gate.request_approval(
        task_id="t-2",
        requester_agent_id="agent-2",
        action_type="service_restart",
        description="Restart backend worker",
        payload={"service": "worker"},
    )
    assert req_l2.status == ApprovalStatus.PENDING

    # Attempting to execute unapproved L2 operation raises UnauthorizedOperationError
    with pytest.raises(UnauthorizedOperationError):
        gate.verify_execution_permission(req_l2.request_id)

    # Authorize with wrong token fails
    with pytest.raises(UnauthorizedOperationError):
        gate.approve(req_l2.request_id, "admin", "invalid-token")

    # Authorize with correct token succeeds
    gate.approve(req_l2.request_id, "admin", req_l2.approval_token, comment="Approved by Lead")
    assert req_l2.status == ApprovalStatus.APPROVED
    assert gate.verify_execution_permission(req_l2.request_id) is True


def test_runtime_config_cas_and_rollback():
    cfg = RuntimeConfigManager()
    current = cfg.get_current_config()
    v1 = current["version"]

    # Update with correct version succeeds
    snap2 = cfg.update_config(
        expected_version=v1,
        updates={"default_max_total_tokens": 150000, "default_max_steps": 12},
        description="Tune limits for complex tasks",
    )
    assert snap2.version == v1 + 1
    assert cfg.get_parameter("default_max_total_tokens") == 150000

    # CAS Conflict with stale version raises error
    with pytest.raises(ConfigConflictError):
        cfg.update_config(expected_version=v1, updates={"default_max_steps": 20})

    # Rollback to v1
    snap3 = cfg.rollback_to_version(target_version=1)
    assert snap3.version == v1 + 2
    assert cfg.get_parameter("default_max_total_tokens") == current["parameters"]["default_max_total_tokens"]
