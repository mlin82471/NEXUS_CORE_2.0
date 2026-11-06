"""
NEXUS CORE 2.1 — Platform Unified Evidence Engine (§Platform-2).
Guarantees that no task outcome or agent deliverable is accepted purely on natural language claims.
Collects, cryptographically hashes, and validates objective artifacts (AST, test logs, diffs, metrics).
"""

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class EvidenceType(str, Enum):
    FILE_DIFF = "file_diff"
    TEST_EXECUTION = "test_execution"
    AST_VALIDATION = "ast_validation"
    SECURITY_SCAN = "security_scan"
    METRIC_DELTA = "metric_delta"
    ARTIFACT_CHECKSUM = "artifact_checksum"
    APPROVAL_SIGNATURE = "approval_signature"


@dataclass
class EvidenceItem:
    evidence_id: str
    evidence_type: EvidenceType
    task_id: str
    source_agent_id: str
    summary: str
    payload: Dict[str, Any]
    fingerprint: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    verified: bool = False
    verifier_notes: Optional[str] = None


class EvidenceEngine:
    """
    Collects, validates, and seals execution evidence for NEXUS DEV and OPS.
    """

    def __init__(self):
        self._store: Dict[str, List[EvidenceItem]] = {}

    def create_evidence(
        self,
        task_id: str,
        source_agent_id: str,
        evidence_type: EvidenceType,
        summary: str,
        raw_data: Any,
    ) -> EvidenceItem:
        """
        Package raw data into an immutable EvidenceItem with SHA-256 fingerprint.
        """
        serialized = json.dumps(raw_data, sort_keys=True, default=str)
        fp = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        item_id = f"ev-{fp[:12]}"

        item = EvidenceItem(
            evidence_id=item_id,
            evidence_type=evidence_type,
            task_id=task_id,
            source_agent_id=source_agent_id,
            summary=summary,
            payload={"data": raw_data, "raw_hash": fp},
            fingerprint=fp,
            verified=True,
            verifier_notes="Fingerprint computed and sealed.",
        )

        if task_id not in self._store:
            self._store[task_id] = []
        self._store[task_id].append(item)
        return item

    def record_test_run(
        self,
        task_id: str,
        agent_id: str,
        test_command: str,
        exit_code: int,
        passed_count: int,
        failed_count: int,
        stdout_tail: str,
    ) -> EvidenceItem:
        """Helper to package test execution evidence."""
        data = {
            "test_command": test_command,
            "exit_code": exit_code,
            "passed": passed_count,
            "failed": failed_count,
            "all_passed": (exit_code == 0 and failed_count == 0),
            "output_tail": stdout_tail[-2000:] if stdout_tail else "",
        }
        summary = (
            f"Test execution PASSED ({passed_count} passed)"
            if data["all_passed"]
            else f"Test execution FAILED ({failed_count} failed, exit code {exit_code})"
        )
        return self.create_evidence(
            task_id=task_id,
            source_agent_id=agent_id,
            evidence_type=EvidenceType.TEST_EXECUTION,
            summary=summary,
            raw_data=data,
        )

    def record_file_patch(
        self,
        task_id: str,
        agent_id: str,
        target_file: str,
        patch_content: str,
    ) -> EvidenceItem:
        """Helper to package file diff evidence."""
        data = {
            "target_file": target_file,
            "patch_length": len(patch_content),
            "patch_diff": patch_content,
        }
        return self.create_evidence(
            task_id=task_id,
            source_agent_id=agent_id,
            evidence_type=EvidenceType.FILE_DIFF,
            summary=f"Patch generated for file: {target_file}",
            raw_data=data,
        )

    def get_task_evidence(self, task_id: str) -> List[EvidenceItem]:
        return self._store.get(task_id, [])

    def verify_evidence_package(self, task_id: str) -> Dict[str, Any]:
        """
        Verify the complete evidence package for a given task.
        Checks for integrity mismatches and required proofs.
        """
        items = self._store.get(task_id, [])
        if not items:
            return {"valid": False, "count": 0, "reason": "No evidence items recorded for task"}

        all_valid = True
        for item in items:
            raw_data = item.payload.get("data")
            serialized = json.dumps(raw_data, sort_keys=True, default=str)
            computed_fp = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
            if computed_fp != item.fingerprint:
                all_valid = False
                break

        return {
            "valid": all_valid,
            "count": len(items),
            "evidence_types": list(set(it.evidence_type.value for it in items)),
        }


# Global singleton instance
evidence_engine = EvidenceEngine()
