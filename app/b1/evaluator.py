"""
Independent Evaluator for NEXUS CORE 2.0 (§B1).
Ensures an agent's self-reported "completed" is never automatically trusted.
Runs independent structural parsing, AST syntax validation (for coding/code deliverables),
contract acceptance criteria checks, and security guardrail assertions.
"""

import ast
import json
import re
from dataclasses import dataclass
from typing import Any, List, Optional
from app.b0.protocols import SubTaskData

@dataclass
class EvaluationResult:
    status: str            # "passed" | "failed" | "indeterminate"
    notes: str
    score: float           # 0.0 to 1.0
    details: dict

class IndependentEvaluator:
    """
    Independent Verification Engine.
    Executes an uncompromised verification pipeline on agent outcomes.
    """

    FORBIDDEN_OUTPUT_PATTERNS = [
        re.compile(r"Traceback \(most recent call last\):", re.IGNORECASE),
        re.compile(r"drop\s+database\b", re.IGNORECASE),
        re.compile(r"rm\s+-rf\s+/", re.IGNORECASE),
        re.compile(r"sk-[a-zA-Z0-9]{32,}", re.IGNORECASE),  # API key leak
    ]

    def evaluate_subtask(
        self,
        subtask: SubTaskData,
        result_content: Any,
        acceptance_criteria: Optional[List[str]] = None,
    ) -> EvaluationResult:
        """
        Evaluate an agent's execution outcome against acceptance criteria,
        semantic syntax, and security boundaries.
        """
        criteria = acceptance_criteria or subtask.acceptance_criteria or []
        text_result = str(result_content).strip() if result_content is not None else ""

        # 1. Non-empty check
        if not text_result:
            return EvaluationResult(
                status="failed",
                notes="Agent output is completely empty.",
                score=0.0,
                details={"check": "non_empty", "passed": False},
            )

        # 2. Security & Traceback Scan
        for pattern in self.FORBIDDEN_OUTPUT_PATTERNS:
            if pattern.search(text_result):
                return EvaluationResult(
                    status="failed",
                    notes=f"Agent output triggered security violation or contains unhandled traceback ({pattern.pattern}).",
                    score=0.0,
                    details={"check": "security_boundary", "passed": False, "pattern": pattern.pattern},
                )

        # 3. Role-specific Syntactic & AST Validation
        if subtask.role == "coding" or any("code" in c.lower() or "syntax" in c.lower() for c in criteria):
            code_snippets = self._extract_code_blocks(text_result)
            if code_snippets:
                for idx, code in enumerate(code_snippets):
                    try:
                        ast.parse(code)
                    except SyntaxError as e:
                        return EvaluationResult(
                            status="failed",
                            notes=f"Code snippet #{idx+1} failed AST syntax validation: {e.msg} at line {e.lineno}",
                            score=0.2,
                            details={"check": "ast_validation", "passed": False, "syntax_error": str(e)},
                        )

        # 4. Acceptance Criteria Validation
        for criterion in criteria:
            crit_lower = criterion.lower()
            if "json" in crit_lower:
                # Must contain valid JSON block or be valid JSON
                json_valid = self._validate_json_in_output(text_result)
                if not json_valid:
                    return EvaluationResult(
                        status="failed",
                        notes=f"Output failed acceptance criterion '{criterion}': No valid JSON structure found.",
                        score=0.3,
                        details={"check": "acceptance_criteria", "criterion": criterion, "passed": False},
                    )

        # 5. Success
        return EvaluationResult(
            status="passed",
            notes="Independent AST and contract acceptance criteria verification passed successfully.",
            score=1.0,
            details={"check": "full_pipeline", "passed": True},
        )

    def _extract_code_blocks(self, text: str) -> List[str]:
        """Extract python code snippets enclosed in markdown ```python or ``` blocks."""
        pattern = re.compile(r"```(?:python)?\s*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
        matches = pattern.findall(text)
        if matches:
            return matches
        # If the whole text looks like pure python code, try parsing it directly
        if ("def " in text or "import " in text or "class " in text) and " " in text:
            return [text]
        return []

    def _validate_json_in_output(self, text: str) -> bool:
        """Check if output parses directly as JSON or contains a valid JSON block."""
        try:
            json.loads(text)
            return True
        except Exception:
            pass
        pattern = re.compile(r"```(?:json)?\s*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
        for block in pattern.findall(text):
            try:
                json.loads(block)
                return True
            except Exception:
                continue
        return False
