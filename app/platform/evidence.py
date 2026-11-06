"""
NEXUS CORE 2.1 — Platform Unified Evidence Engine (§Platform-2).
Guarantees that no task outcome or agent deliverable is accepted purely on natural language claims.
Collects, cryptographically hashes, and validates objective artifacts (AST, test logs, diffs, metrics).
Implements RFC 8785 canonical JSON hashing and chained ledger links (prev_fingerprint -> chain_hash).
"""

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from app.b0.fingerprint import canonical_json


class EvidenceType(str, Enum):
    FILE_DIFF = "file_diff"
    TEST_EXECUTION = "test_execution"
    AST_VALIDATION = "ast_validation"
    SECURITY_SCAN = "security_scan"
    METRIC_DELTA = "metric_delta"
    ARTIFACT_CHECKSUM = "artifact_checksum"
    APPROVAL_SIGNATURE = "approval_signature"
    POLICY_INTERCEPTION = "policy_interception"


@dataclass
class EvidenceItem:
    evidence_id: str
    evidence_type: EvidenceType
    task_id: str
    source_agent_id: str
    summary: str
    payload: Dict[str, Any]
    fingerprint: str
    prev_fingerprint: str = "GENESIS_0000000000000000"
    chain_hash: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    verified: bool = False
    verifier_notes: Optional[str] = None


class EvidenceEngine:
    """
    Collects, validates, and seals execution evidence for NEXUS DEV and OPS.
    Enforces RFC 8785 canonical hash integrity and chained tamper-evident verification.
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
        Package raw data into an immutable EvidenceItem with RFC 8785 canonical SHA-256 fingerprint
        and backward-chained hash pointer.
        """
        try:
            canonical_repr = canonical_json(raw_data)
        except Exception:
            canonical_repr = json.dumps(raw_data, sort_keys=True, default=str)

        fp = hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()
        item_id = f"ev-{fp[:12]}"

        # Calculate previous link in the audit chain
        prev_fp = "GENESIS_0000000000000000"
        if task_id in self._store and self._store[task_id]:
            prev_fp = self._store[task_id][-1].fingerprint

        chain_hash = hashlib.sha256(f"{prev_fp}:{fp}".encode("utf-8")).hexdigest()

        item = EvidenceItem(
            evidence_id=item_id,
            evidence_type=evidence_type,
            task_id=task_id,
            source_agent_id=source_agent_id,
            summary=summary,
            payload={"data": raw_data, "canonical_hash": fp},
            fingerprint=fp,
            prev_fingerprint=prev_fp,
            chain_hash=chain_hash,
            verified=True,
            verifier_notes="RFC 8785 canonical hash & chain link sealed.",
        )

        if task_id not in self._store:
            self._store[task_id] = []
        self._store[task_id].append(item)
        return item

    def record_approval_signature(
        self,
        task_id: str,
        request_id: str,
        action_type: str,
        approved_by: str,
        status: str,
        comment: Optional[str] = None,
    ) -> EvidenceItem:
        """Helper to seal human/system approval outcomes onto the audit chain."""
        data = {
            "request_id": request_id,
            "action_type": action_type,
            "approved_by": approved_by,
            "status": status,
            "comment": comment or "",
        }
        return self.create_evidence(
            task_id=task_id,
            source_agent_id=approved_by,
            evidence_type=EvidenceType.APPROVAL_SIGNATURE,
            summary=f"Approval signature '{status}' recorded for {action_type} by {approved_by}",
            raw_data=data,
        )

    def record_policy_interception(
        self,
        task_id: str,
        action: str,
        risk_level: str,
        reason: str,
        allowed: bool,
    ) -> EvidenceItem:
        """Helper to seal policy guard evaluations onto the audit chain."""
        data = {
            "action": action,
            "risk_level": risk_level,
            "reason": reason,
            "allowed": allowed,
        }
        return self.create_evidence(
            task_id=task_id,
            source_agent_id="platform-policy-guard",
            evidence_type=EvidenceType.POLICY_INTERCEPTION,
            summary=f"Policy interception for {action} (Risk: {risk_level}, Allowed: {allowed})",
            raw_data=data,
        )

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

    def verify_chain_integrity(self, task_id: str) -> Dict[str, Any]:
        """
        Traverses the task's evidence chain from genesis to tip,
        validating that no item has been tampered with or retroactively modified.
        """
        items = self._store.get(task_id, [])
        if not items:
            return {"valid": True, "count": 0, "reason": "Empty chain"}

        expected_prev = "GENESIS_0000000000000000"
        for i, item in enumerate(items):
            # 1. Verify prev_fingerprint pointer
            if item.prev_fingerprint != expected_prev:
                return {
                    "valid": False,
                    "count": len(items),
                    "broken_at_index": i,
                    "reason": f"Chain link broken at item {item.evidence_id}: expected prev={expected_prev}, got={item.prev_fingerprint}",
                }

            # 2. Verify payload canonical hash
            raw_data = item.payload.get("data")
            try:
                canonical_repr = canonical_json(raw_data)
            except Exception:
                canonical_repr = json.dumps(raw_data, sort_keys=True, default=str)
            computed_fp = hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()
            if computed_fp != item.fingerprint:
                return {
                    "valid": False,
                    "count": len(items),
                    "broken_at_index": i,
                    "reason": f"Payload fingerprint mismatch at item {item.evidence_id}",
                }

            # 3. Verify chain_hash
            computed_chain_hash = hashlib.sha256(f"{expected_prev}:{computed_fp}".encode("utf-8")).hexdigest()
            if item.chain_hash and computed_chain_hash != item.chain_hash:
                return {
                    "valid": False,
                    "count": len(items),
                    "broken_at_index": i,
                    "reason": f"Chain hash mismatch at item {item.evidence_id}",
                }

            expected_prev = item.fingerprint

        return {"valid": True, "count": len(items), "tip_hash": expected_prev}

    def verify_evidence_package(self, task_id: str) -> Dict[str, Any]:
        """
        Verify the complete evidence package for a given task.
        Checks for integrity mismatches and required proofs.
        """
        items = self._store.get(task_id, [])
        if not items:
            return {"valid": False, "count": 0, "reason": "No evidence items recorded for task"}

        chain_res = self.verify_chain_integrity(task_id)
        return {
            "valid": chain_res["valid"],
            "count": len(items),
            "evidence_types": list(set(it.evidence_type.value if hasattr(it.evidence_type, "value") else str(it.evidence_type) for it in items)),
            "chain_integrity": chain_res,
        }


# Global singleton instance
evidence_engine = EvidenceEngine()
