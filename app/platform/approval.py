"""
NEXUS CORE 2.1 — Platform Approval Gate & Execution Guard (§Platform-4).
Manages human-in-the-loop authorization tokens for L2 (Service/Config) and L3 (Destructive) operations.
Prevents unapproved execution of sensitive tasks across DEV and OPS.
"""

import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from app.platform.policy import RiskLevel, policy_engine
from app.platform.evidence import evidence_engine


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class ApprovalError(Exception):
    """Base exception for approval gate failures."""


class UnauthorizedOperationError(ApprovalError):
    """Operation attempted without required approval token or with invalid token."""


@dataclass
class ApprovalRequest:
    request_id: str
    task_id: str
    requester_agent_id: str
    action_type: str
    risk_level: RiskLevel
    description: str
    payload: Dict[str, Any]
    approval_token: str
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    expires_at_epoch: float = field(default_factory=lambda: time.time() + 3600.0)  # 1 hour expiry
    approved_by: Optional[str] = None
    approval_comment: Optional[str] = None


class ApprovalGate:
    """
    Manages approval lifecycles and enforces execution guards.
    """

    def __init__(self):
        self._requests: Dict[str, ApprovalRequest] = {}

    def request_approval(
        self,
        task_id: str,
        requester_agent_id: str,
        action_type: str,
        description: str,
        payload: Dict[str, Any],
        target_path: Optional[str] = None,
        command: Optional[str] = None,
        risk_level: Optional[RiskLevel] = None,
    ) -> ApprovalRequest:
        """
        Calculates authoritative risk level (or uses explicit override) and generates an approval request.
        """
        risk = risk_level or policy_engine.evaluate_risk(
            action_type=action_type,
            target_path=target_path,
            command=command,
            parameters=payload,
        )

        req_id = f"apr-{secrets.token_hex(6)}"
        token = f"nxtk_{secrets.token_urlsafe(24)}"

        req = ApprovalRequest(
            request_id=req_id,
            task_id=task_id,
            requester_agent_id=requester_agent_id,
            action_type=action_type,
            risk_level=risk,
            description=description,
            payload=payload,
            approval_token=token,
            status=ApprovalStatus.APPROVED if not policy_engine.requires_human_approval(risk) else ApprovalStatus.PENDING,
        )

        self._requests[req_id] = req
        return req

    def approve(
        self,
        request_id: str,
        approver_identity: str,
        approval_token: str,
        comment: Optional[str] = None,
    ) -> ApprovalRequest:
        """
        Authorize a pending request with token validation.
        """
        req = self._requests.get(request_id)
        if not req:
            raise ApprovalError(f"Approval request '{request_id}' not found")

        if time.time() > req.expires_at_epoch:
            req.status = ApprovalStatus.EXPIRED
            raise ApprovalError(f"Approval request '{request_id}' has expired")

        if req.status != ApprovalStatus.PENDING:
            raise ApprovalError(f"Cannot approve request in '{req.status.value}' state")

        if req.approval_token != approval_token:
            raise UnauthorizedOperationError("Provided approval token is invalid")

        req.status = ApprovalStatus.APPROVED
        req.approved_by = approver_identity
        req.approval_comment = comment

        # Cryptographically seal approval signature into tamper-proof evidence chain
        evidence_engine.record_approval_signature(
            task_id=req.task_id,
            request_id=req.request_id,
            action_type=req.action_type,
            approved_by=approver_identity,
            status="APPROVED",
            comment=comment,
        )
        return req

    def reject(
        self,
        request_id: str,
        rejector_identity: str,
        reason: str,
    ) -> ApprovalRequest:
        req = self._requests.get(request_id)
        if not req:
            raise ApprovalError(f"Approval request '{request_id}' not found")

        req.status = ApprovalStatus.REJECTED
        req.approved_by = rejector_identity
        req.approval_comment = f"Rejected: {reason}"

        # Cryptographically seal rejection into tamper-proof evidence chain
        evidence_engine.record_approval_signature(
            task_id=req.task_id,
            request_id=req.request_id,
            action_type=req.action_type,
            approved_by=rejector_identity,
            status="REJECTED",
            comment=reason,
        )
        return req

    def verify_execution_permission(
        self,
        request_id: str,
    ) -> bool:
        """
        Guard executed right before running a protected operation.
        """
        req = self._requests.get(request_id)
        if not req:
            raise UnauthorizedOperationError(f"No authorization request found for '{request_id}'")

        if req.status != ApprovalStatus.APPROVED:
            raise UnauthorizedOperationError(
                f"Operation blocked by ApprovalGate: Current status is '{req.status.value}' (Risk: L{req.risk_level})"
            )

        if time.time() > req.expires_at_epoch:
            req.status = ApprovalStatus.EXPIRED
            raise UnauthorizedOperationError("Operation blocked: Approval authorization has expired")

        return True

    def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        return self._requests.get(request_id)


# Global singleton instance
approval_gate = ApprovalGate()
