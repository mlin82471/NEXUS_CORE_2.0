"""
NEXUS CORE 2.1 — NEXUS OPS Schemas & Contracts (§OPS-1).
Defines contracts for autonomous operations, anomaly detection, RCA, and remediation.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from app.platform.policy import RiskLevel


class IncidentSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OpsPlanStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    EXECUTING = "executing"
    EXECUTED = "executed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class TelemetrySnapshot:
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    cpu_usage_pct: float = 0.0
    memory_usage_pct: float = 0.0
    disk_usage_pct: float = 0.0
    error_rate_pct: float = 0.0
    active_connections: int = 0
    raw_metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Incident:
    incident_id: str
    title: str
    severity: IncidentSeverity
    detected_at: str
    trigger_metric: str
    metric_value: float
    threshold: float
    description: str
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RootCauseReport:
    incident_id: str
    root_cause_hypothesis: str
    confidence: float           # 0.0 to 1.0
    contributing_factors: List[str]
    evidence_indicators: List[str]
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class RemediationAction:
    action_id: str
    description: str
    command: str
    target_resource: str
    risk_level: RiskLevel
    reversible: bool
    rollback_command: Optional[str] = None


@dataclass
class RemediationPlan:
    plan_id: str
    incident_id: str
    title: str
    root_cause_hypothesis: str
    confidence: float
    proposed_actions: List[RemediationAction]
    overall_risk_level: RiskLevel
    preconditions: List[str]
    rollback_plan: List[str]
    expected_health_state: Dict[str, Any]
    approval_request_id: Optional[str] = None
    approval_token: Optional[str] = None
    status: OpsPlanStatus = OpsPlanStatus.DRAFT
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class HealthCheckResult:
    is_healthy: bool
    recovered: bool
    metrics_before: Dict[str, Any]
    metrics_after: Dict[str, Any]
    verification_notes: str
    checked_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
