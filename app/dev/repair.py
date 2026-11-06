"""
NEXUS CORE 2.1 — NEXUS DEV Automated Defect Diagnosis & Repair (§DEV-5).
Diagnoses test failures and review violations to propose targeted patch repairs.
"""

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class RepairPlan:
    fault_summary: str
    failing_file: Optional[str]
    line_number: Optional[int]
    error_type: str
    repair_strategy: str


class DevRepairEngine:
    """
    Automated triage and repair planner for failed test runs and code review issues.
    """

    def diagnose_failure(
        self,
        test_output: str,
        review_findings: Optional[List[str]] = None,
    ) -> RepairPlan:
        # Extract Traceback information if present
        failing_file = None
        line_num = None
        err_type = "GenericExecutionFailure"

        file_match = re.search(r'File "([^"]+)", line (\d+)', test_output)
        if file_match:
            failing_file = file_match.group(1)
            line_num = int(file_match.group(2))

        err_match = re.search(r"(\w+Error): (.+)", test_output)
        if err_match:
            err_type = err_match.group(1)
            fault_msg = f"{err_type}: {err_match.group(2).strip()}"
        else:
            fault_msg = "Test suite assertions failed without explicit exception traceback."

        # Review findings inclusion
        findings = review_findings or []
        if findings:
            strategy = f"Address {len(findings)} review findings and resolve {err_type} at {failing_file or 'test suite'}."
        else:
            strategy = f"Fix {err_type} exception in {failing_file or 'target module'} and rerun tests."

        return RepairPlan(
            fault_summary=fault_msg,
            failing_file=failing_file,
            line_number=line_num,
            error_type=err_type,
            repair_strategy=strategy,
        )
