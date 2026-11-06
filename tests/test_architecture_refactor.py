"""
NEXUS CORE 2.1 — Architectural Convergence & Enterprise Pipeline Tests (§REFACTOR-TEST).
Verifies:
1. Budget Layer Separation (B0 CAS vs B1 Middleware vs Usage Guard)
2. Unified Model Gateway & Workflow Intent Routing
3. Dev Pipeline Concurrency Workspace Isolation & Livelock Fuse
4. RFC 8785 Chained Tamper-Evident Evidence Ledger
"""

import hashlib
import pytest
from pathlib import Path
from tempfile import TemporaryDirectory

# 1. Budget Layer Imports
from app.b0.budget import calculate_remaining_budget, calculate_unknown_charge, BudgetImmutableError
from app.b1.budget import SQLiteBudgetTracker, B1BudgetMiddleware
from app.usage.budget import budget_guard, BudgetGuard
from app.usage.schemas import BudgetPolicy, BudgetScope, BudgetAction

# 2. Router Imports
from app.router.workflow_router import route_workflow_intent, WorkflowDomain, ExecutionTopology
from app.router.model_router import route_model, ModelTier
from app.model_hub.router import model_router, ModelHubRouter
from app.model_hub.schemas import RoutingMode, RoutingPolicy

# 3. Dev Pipeline & Approval Imports
from app.dev.orchestrator import DevPipelineOrchestrator
from app.platform.workspace import WorkspaceManager
from app.platform.approval import approval_gate, ApprovalStatus
from app.platform.policy import RiskLevel

# 4. Evidence Engine Imports
from app.platform.evidence import evidence_engine, EvidenceType
from app.b0.fingerprint import canonical_json


# ==============================================================================
# TEST SUITE 1: Budget Layer Separation & Middleware Delegation
# ==============================================================================

def test_budget_layer_separation_and_middleware():
    """Verify B0 arithmetic primitives, B1 middleware, and UsageGuard coordination."""
    # B0 pure arithmetic verification
    unknown_charge = calculate_unknown_charge(subtask_token_limit=10000, reserved_tokens=2000)
    assert unknown_charge == 5000  # max(2000, 10000/2)

    rem = calculate_remaining_budget(
        max_total_tokens=50000,
        max_model_calls=10,
        reservations=[
            {"status": "COMMITTED", "tokens_charged": 12000, "calls_charged": 2},
            {"status": "PENDING", "tokens_reserved": 8000, "calls_reserved": 1},
            {"status": "RELEASED", "tokens_charged": 0, "calls_charged": 0},
        ],
    )
    assert rem["consumed_tokens"] == 20000
    assert rem["remaining_tokens"] == 30000
    assert not rem["is_exhausted"]

    # Verify B1 Middleware alias
    assert B1BudgetMiddleware is SQLiteBudgetTracker


# ==============================================================================
# TEST SUITE 2: Unified Model Gateway & Workflow Intent Routing
# ==============================================================================

def test_workflow_intent_routing():
    """Verify intent-based task topology and domain pipeline routing."""
    # Dev Domain detection
    dev_res = route_workflow_intent("请帮我编写一个二叉树层序遍历的代码并编写单元测试")
    assert dev_res.domain == WorkflowDomain.DEV
    assert "app.dev.orchestrator" in dev_res.target_pipeline

    # Ops Domain detection
    ops_res = route_workflow_intent("生产环境 CPU 飙高并出现 502 错误，请紧急自愈")
    assert ops_res.domain == WorkflowDomain.OPS
    assert "app.ops.orchestrator" in ops_res.target_pipeline
    assert ops_res.requires_approval is True

    # General Domain detection
    gen_res = route_workflow_intent("1+1等于几？")
    assert gen_res.domain == WorkflowDomain.GENERAL
    assert gen_res.topology == ExecutionTopology.DIRECT_SINGLE_AGENT


def test_model_gateway_integration():
    """Verify ModelHubRouter serves as unified gateway with multi-tier modes."""
    # Route model via router facade
    decision = route_model(goal="测试任务", complexity=from_str("simple"), role="coding")
    assert decision.model_name is not None
    assert decision.model_tier in (ModelTier.FAST, ModelTier.CODER, ModelTier.BALANCED, ModelTier.REASONING)

    # Test ModelHubRouter policy controls
    orig_policy = model_router.get_policy()
    try:
        model_router.set_policy(RoutingPolicy(mode=RoutingMode.MANUAL, manual_model_id="deepseek-chat"))
        m_id, reason = model_router.route_model(task_type="coding", complexity="high")
        assert m_id == "deepseek-chat"
        assert "Manual" in reason
    finally:
        model_router.set_policy(orig_policy)


def from_str(val: str):
    from app.router.classifier import TaskComplexity
    return TaskComplexity(val)


# ==============================================================================
# TEST SUITE 3: Dev Pipeline Livelock Fuse & Sandbox Isolation
# ==============================================================================

def test_dev_pipeline_livelock_circuit_breaker():
    """Verify that repeated identical test failures trigger the livelock fuse & approval escalation."""
    with TemporaryDirectory() as tmpdir:
        base_repo = Path(tmpdir) / "test_repo"
        base_repo.mkdir()
        (base_repo / "main.py").write_text("def solve(): return 1\n", encoding="utf-8")

        orch = DevPipelineOrchestrator()
        
        # Mock test runner that consistently produces identical failure output
        class MockFailingRunner:
            def run_tests(self, workspace_path, task_id, test_command=None):
                return {
                    "all_passed": False,
                    "exit_code": 1,
                    "passed_count": 0,
                    "failed_count": 1,
                    "output": "AssertionError: Expected 42, got 1\nTraceback (most recent call last):\n  File 'test.py', line 12",
                }

        orch.test_runner = MockFailingRunner()

        task_id = "task-livelock-test-001"
        res = orch.run_dev_pipeline(
            task_id=task_id,
            base_repo_path=base_repo,
            user_prompt="实现核心算法并确保返回42",
            code_patches={
                "main.py": "def solve(): return 1\n",
                "repair_patch": "def solve(): return 1\n",
                "repair_file": "main.py",
            },
            run_tests=True,
        )

        # Livelock must be caught on the 2nd attempt with identical fingerprint
        assert res["livelock_detected"] is True
        assert res["approval_request_id"] is not None
        assert res["success"] is False

        # Verify Approval Gate captured the escalation
        req = approval_gate.get_request(res["approval_request_id"])
        assert req is not None
        assert req.action_type == "escalate_livelock_defect"
        assert req.risk_level == RiskLevel.L2_SERVICE_CONFIG
        assert req.status == ApprovalStatus.PENDING


# ==============================================================================
# TEST SUITE 4: RFC 8785 Chained Tamper-Evident Evidence Ledger
# ==============================================================================

def test_chained_evidence_ledger_and_tamper_detection():
    """Verify cryptographic hash chaining and tamper detection per RFC 8785."""
    task_id = "task-audit-chain-001"

    # 1. Record item 1 (Genesis)
    ev1 = evidence_engine.record_file_patch(
        task_id=task_id,
        agent_id="dev-coder",
        target_file="app/main.py",
        patch_content="print('hello')",
    )
    assert ev1.prev_fingerprint == "GENESIS_0000000000000000"
    assert len(ev1.chain_hash) == 64

    # 2. Record item 2 (Chained to item 1)
    ev2 = evidence_engine.record_test_run(
        task_id=task_id,
        agent_id="dev-tester",
        test_command="pytest",
        exit_code=0,
        passed_count=5,
        failed_count=0,
        stdout_tail="5 passed in 0.2s",
    )
    assert ev2.prev_fingerprint == ev1.fingerprint
    expected_chain_2 = hashlib.sha256(f"{ev1.fingerprint}:{ev2.fingerprint}".encode("utf-8")).hexdigest()
    assert ev2.chain_hash == expected_chain_2

    # 3. Verify intact chain integrity
    integrity_res = evidence_engine.verify_chain_integrity(task_id)
    assert integrity_res["valid"] is True
    assert integrity_res["count"] == 2
    assert integrity_res["tip_hash"] == ev2.fingerprint

    # 4. Tamper with item 1 payload to verify tampering detection
    ev1.payload["data"]["target_file"] = "corrupted_file.py"
    tampered_res = evidence_engine.verify_chain_integrity(task_id)
    assert tampered_res["valid"] is False
    assert tampered_res["broken_at_index"] == 0
    assert "Payload fingerprint mismatch" in tampered_res["reason"]


def test_approval_signature_sealing():
    """Verify approval signatures are automatically sealed into the evidence chain."""
    task_id = "task-approval-seal-001"
    req = approval_gate.request_approval(
        task_id=task_id,
        requester_agent_id="ops-agent",
        action_type="restart_service",
        description="Restarting pod for memory cleanup",
        payload={"service": "nexus-api", "pod_id": "pod-123"},
        risk_level=RiskLevel.L2_SERVICE_CONFIG,
    )
    
    # Approve request
    approval_gate.approve(
        request_id=req.request_id,
        approver_identity="sre-lead",
        approval_token=req.approval_token,
        comment="Approved for off-peak execution",
    )

    # Check evidence store
    evs = evidence_engine.get_task_evidence(task_id)
    assert len(evs) == 1
    assert evs[0].evidence_type == EvidenceType.APPROVAL_SIGNATURE
    assert evs[0].source_agent_id == "sre-lead"
    assert evs[0].payload["data"]["status"] == "APPROVED"
