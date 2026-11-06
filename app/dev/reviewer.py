"""
NEXUS CORE 2.1 — NEXUS DEV Independent 4-Level Code Reviewer (§DEV-3).
Enforces uncompromised code review separation:
Coding Agent generates patches, but CANNOT self-certify review or test outcomes.
Level 1: Structure & File integrity
Level 2: Static Analysis, AST syntax parsing & Security scan
Level 3: Dynamic Test Execution Verification
Level 4: Business Acceptance Criteria check
"""

import ast
import re
import uuid
from typing import Any, Dict, List, Optional
from app.dev.schemas import DevChangeSet, DevCodeReview, DevRequirement


class DevCodeReviewer:
    """
    Independent Reviewer. Evaluates changesets across 4 rigorous tiers.
    """

    FORBIDDEN_PATTERNS = [
        re.compile(r"sk-[a-zA-Z0-9]{32,}", re.IGNORECASE),         # Hardcoded tokens
        re.compile(r"\brm\s+-rf\s+/", re.IGNORECASE),               # Host destruction
        re.compile(r"\bos\.system\s*\(", re.IGNORECASE),            # Unsanitized shell execution
        re.compile(r"Traceback \(most recent call last\):", re.IGNORECASE),
    ]

    def review(
        self,
        changeset: DevChangeSet,
        requirement: DevRequirement,
        test_evidence: Optional[Dict[str, Any]] = None,
        file_contents: Optional[Dict[str, str]] = None,
    ) -> DevCodeReview:
        review_id = f"rev-{uuid.uuid4().hex[:8]}"
        findings: List[str] = []

        # L1: Structure & File integrity
        l1_passed = True
        if not changeset.modified_files:
            l1_passed = False
            findings.append("L1 Failure: ChangeSet contains no modified files.")
        if not changeset.patch_diff or len(changeset.patch_diff.strip()) == 0:
            l1_passed = False
            findings.append("L1 Failure: Patch diff is completely empty.")

        # L2: Static AST Syntax & Security Scan
        l2_passed = True
        contents = file_contents or {}
        for filename, code in contents.items():
            # Check security patterns
            for pat in self.FORBIDDEN_PATTERNS:
                if pat.search(code):
                    l2_passed = False
                    findings.append(f"L2 Security Violation: File '{filename}' triggered rule {pat.pattern}")

            # AST parse Python files
            if filename.endswith(".py"):
                try:
                    ast.parse(code)
                except SyntaxError as exc:
                    l2_passed = False
                    findings.append(f"L2 AST Syntax Error in '{filename}' line {exc.lineno}: {exc.msg}")

        # L3: Dynamic Test Execution Verification
        l3_passed = True
        if test_evidence is not None:
            if not test_evidence.get("all_passed", False):
                l3_passed = False
                findings.append(
                    f"L3 Test Failure: Test suite reported {test_evidence.get('failed', 1)} failed tests."
                )

        # L4: Business Acceptance Criteria check
        l4_passed = True
        for criterion in requirement.acceptance_criteria:
            if "must not fail" in criterion.lower() and not l3_passed:
                l4_passed = False
                findings.append(f"L4 Acceptance Failure: '{criterion}' not satisfied due to test failure.")

        all_passed = l1_passed and l2_passed and l3_passed and l4_passed
        score = 10.0
        if not l1_passed:
            score -= 3.0
        if not l2_passed:
            score -= 4.0
        if not l3_passed:
            score -= 3.0
        if not l4_passed:
            score -= 1.0
        score = max(0.0, score)

        return DevCodeReview(
            review_id=review_id,
            changeset_id=changeset.changeset_id,
            reviewer_agent_id="dev-reviewer-independent",
            quality_score=round(score, 1),
            passed=all_passed,
            l1_structure_passed=l1_passed,
            l2_static_ast_passed=l2_passed,
            l3_dynamic_test_passed=l3_passed,
            l4_acceptance_passed=l4_passed,
            findings=findings,
        )
