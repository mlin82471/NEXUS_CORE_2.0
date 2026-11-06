"""
Unit & Integration Tests for NEXUS CORE 2.1 — NEXUS DEV Autonomous Engineering System (§DEV).
Validates:
1. Requirements parsing into functional specs and acceptance criteria.
2. Independent 4-level code review pipeline (preventing self-certification).
3. Automated defect diagnosis from traceback output.
4. End-to-end engineering pipeline execution in verified isolated workspace.
"""

from pathlib import Path
import pytest

from app.dev.requirements import RequirementsAnalyzer
from app.dev.reviewer import DevCodeReviewer
from app.dev.repair import DevRepairEngine
from app.dev.orchestrator import DevPipelineOrchestrator
from app.dev.schemas import DevChangeSet


def test_requirements_analyzer():
    analyzer = RequirementsAnalyzer()
    prompt = """
    Build a modern rate limiter service.
    Support token bucket algorithm.
    Must return HTTP 429 when quota exceeded.
    Must assert zero memory leaks under 1000 concurrent requests.
    """
    req = analyzer.analyze(prompt, title="Rate Limiter Service")
    assert req.title == "Rate Limiter Service"
    assert req.target_language == "python"
    assert len(req.functional_specs) >= 1
    assert len(req.acceptance_criteria) >= 2


def test_independent_code_reviewer_tiers():
    reviewer = DevCodeReviewer()
    analyzer = RequirementsAnalyzer()
    req = analyzer.analyze("Build simple math module")

    # Case 1: L1 Failure (empty changeset)
    empty_cs = DevChangeSet(
        changeset_id="cs-1",
        workspace_id="ws-1",
        task_id="t-1",
        modified_files=[],
        patch_diff="",
        commit_message="empty",
        author_agent_id="coder",
    )
    rev1 = reviewer.review(empty_cs, req)
    assert not rev1.passed
    assert not rev1.l1_structure_passed

    # Case 2: L2 Failure (AST Syntax Error)
    broken_code = "def add(a, b\n    return a + b"
    cs2 = DevChangeSet(
        changeset_id="cs-2",
        workspace_id="ws-2",
        task_id="t-2",
        modified_files=["math_mod.py"],
        patch_diff="diff",
        commit_message="add math",
        author_agent_id="coder",
    )
    rev2 = reviewer.review(cs2, req, file_contents={"math_mod.py": broken_code})
    assert not rev2.passed
    assert not rev2.l2_static_ast_passed

    # Case 3: L2 Security Violation (Forbidden pattern)
    vuln_code = "import os\ndef nuke():\n    os.system('rm -rf /')\n"
    rev3 = reviewer.review(cs2, req, file_contents={"math_mod.py": vuln_code})
    assert not rev3.passed
    assert not rev3.l2_static_ast_passed
    assert any("Security Violation" in f for f in rev3.findings)

    # Case 4: L3 Test Failure
    valid_code = "def add(a: int, b: int) -> int:\n    return a + b\n"
    rev4 = reviewer.review(
        cs2,
        req,
        test_evidence={"all_passed": False, "failed": 2},
        file_contents={"math_mod.py": valid_code},
    )
    assert not rev4.passed
    assert not rev4.l3_dynamic_test_passed

    # Case 5: All Tiers Pass
    rev5 = reviewer.review(
        cs2,
        req,
        test_evidence={"all_passed": True, "failed": 0},
        file_contents={"math_mod.py": valid_code},
    )
    assert rev5.passed is True
    assert rev5.quality_score == 10.0


def test_repair_engine_traceback_diagnosis():
    repair = DevRepairEngine()
    fake_pytest_traceback = """
    ____________________ test_division ____________________
        def test_division():
    >       assert divide(10, 0) == 0
    math_test.py:15: in test_division
        return a / b
    E   ZeroDivisionError: division by zero
    """
    plan = repair.diagnose_failure(fake_pytest_traceback, ["L3 Test Failure"])
    assert plan.error_type == "ZeroDivisionError"
    assert "division by zero" in plan.fault_summary
    assert plan.repair_strategy is not None


def test_dev_pipeline_orchestrator_end_to_end(tmp_path):
    # Setup base project
    base_repo = tmp_path / "sample_service"
    base_repo.mkdir()
    (base_repo / "README.md").write_text("# Sample Service", encoding="utf-8")

    orchestrator = DevPipelineOrchestrator()

    # Define user task and code deliverables
    user_prompt = "Implement a string reversal utility with unit tests."
    code_patches = {
        "utils/reverser.py": "def reverse_string(s: str) -> str:\n    return s[::-1]\n",
        "tests/test_reverser.py": "from utils.reverser import reverse_string\ndef test_reverse():\n    assert reverse_string('hello') == 'olleh'\n",
    }

    # Run pipeline with test command mock
    res = orchestrator.run_dev_pipeline(
        task_id="dev-task-001",
        base_repo_path=base_repo,
        user_prompt=user_prompt,
        code_patches=code_patches,
        run_tests=False,  # Skip spawning external pytest in test sandbox
    )

    assert res["success"] is True
    assert res["code_review"].passed is True
    assert res["release_package"] is not None
    assert res["release_package"].version == "1.0.0"
    assert len(res["release_package"].evidence_fingerprints) > 0

    # Assert base project remained strictly untouched!
    assert not (base_repo / "utils").exists()
    assert not (base_repo / "tests").exists()
    assert (base_repo / "README.md").read_text(encoding="utf-8") == "# Sample Service"
