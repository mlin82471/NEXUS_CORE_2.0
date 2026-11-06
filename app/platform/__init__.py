"""
NEXUS CORE 2.1 — Shared Platform Infrastructure (§Platform).
Exposes Workspace isolation, Evidence verification, Policy risk classification,
Approval human-in-the-loop gates, and CAS-versioned Runtime Configuration.
"""

from app.platform.workspace import WorkspaceContext, WorkspaceError, WorkspaceManager
from app.platform.evidence import EvidenceEngine, EvidenceItem, EvidenceType, evidence_engine
from app.platform.policy import OperationPolicy, PolicyEngine, RiskLevel, policy_engine
from app.platform.approval import (
    ApprovalError,
    ApprovalGate,
    ApprovalRequest,
    ApprovalStatus,
    UnauthorizedOperationError,
    approval_gate,
)
from app.platform.runtime_config import (
    ConfigConflictError,
    ConfigSnapshot,
    RuntimeConfigManager,
    runtime_config,
)

__all__ = [
    "WorkspaceManager",
    "WorkspaceContext",
    "WorkspaceError",
    "EvidenceEngine",
    "EvidenceItem",
    "EvidenceType",
    "evidence_engine",
    "PolicyEngine",
    "OperationPolicy",
    "RiskLevel",
    "policy_engine",
    "ApprovalGate",
    "ApprovalRequest",
    "ApprovalStatus",
    "ApprovalError",
    "UnauthorizedOperationError",
    "approval_gate",
    "RuntimeConfigManager",
    "ConfigSnapshot",
    "ConfigConflictError",
    "runtime_config",
]
