"""
Unit & Integration Tests for NEXUS CORE 2.1 — NEXUS OPS Autonomous Incident Remediation (§OPS).
Validates:
1. Telemetry collection and simulation overrides.
2. Anomaly detection against SLA thresholds (Memory, CPU, Error rates).
3. Root Cause Analysis (RCA) correlation with log traces.
4. Safe remediation planning with Platform ApprovalGate and Policy risk gating.
5. Post-execution health check verification and evidence sealing.
6. End-to-end OPS pipeline execution.
"""

import pytest

from app.ops.collector import TelemetryCollector
from app.ops.detector import AnomalyDetector
from app.ops.rca import RootCauseAnalyzer
from app.ops.remediator import RemediationPlanner
from app.ops.executor import RemediationExecutor
from app.ops.healthcheck import HealthVerifier
from app.ops.orchestrator import OpsPipelineOrchestrator
from app.ops.schemas import IncidentSeverity, OpsPlanStatus
from app.platform.policy import RiskLevel
from app.evolution.observer import TrustMode, observe_manager


def test_telemetry_collection_and_detector():
    collector = TelemetryCollector()
    detector = AnomalyDetector(memory_threshold=88.0, error_rate_threshold=4.0)

    # 1. Nominal telemetry -> no anomalies
    normal_telem = collector.collect(simulated_overrides={"memory_usage_pct": 55.0, "error_rate_pct": 0.2})
    assert len(detector.detect_anomalies(normal_telem)) == 0

    # 2. Critical Memory surge
    critical_telem = collector.collect(simulated_overrides={"memory_usage_pct": 96.5, "active_connections": 150})
    incidents = detector.detect_anomalies(critical_telem)
    assert len(incidents) >= 1
    inc = incidents[0]
    assert inc.severity == IncidentSeverity.CRITICAL
    assert inc.trigger_metric == "memory_usage_pct"


def test_root_cause_analysis():
    rca = RootCauseAnalyzer()
    collector = TelemetryCollector()
    detector = AnomalyDetector()

    # Memory incident with leak logs
    telem = collector.collect(simulated_overrides={"memory_usage_pct": 92.0})
    incident = detector.detect_anomalies(telem)[0]

    report = rca.analyze(incident, recent_logs=["Process worker leaked buffers", "Memory allocation high"])
    assert "memory leak" in report.root_cause_hypothesis.lower()
    assert report.confidence >= 0.85
    assert len(report.evidence_indicators) > 0


def test_remediation_planner_and_approval_gate():
    collector = TelemetryCollector()
    detector = AnomalyDetector()
    rca = RootCauseAnalyzer()
    planner = RemediationPlanner()

    telem = collector.collect(simulated_overrides={"memory_usage_pct": 92.0})
    inc = detector.detect_anomalies(telem)[0]
    rca_rep = rca.analyze(inc)

    # Generate plan
    plan = planner.plan_remediation(inc, rca_rep, target_service="payment-service")
    assert plan.overall_risk_level == RiskLevel.L2_SERVICE_CONFIG
    assert plan.status == OpsPlanStatus.PENDING_APPROVAL
    assert plan.approval_request_id is not None
    assert plan.approval_token is not None
    assert len(plan.preconditions) >= 1
    assert len(plan.rollback_plan) >= 1


def test_remediation_executor_observe_mode_and_approval_enforcement():
    collector = TelemetryCollector()
    detector = AnomalyDetector()
    rca = RootCauseAnalyzer()
    planner = RemediationPlanner()
    executor = RemediationExecutor()

    # Memory incident creates L2 service restart plan requiring approval
    telem = collector.collect(simulated_overrides={"memory_usage_pct": 94.0})
    inc = detector.detect_anomalies(telem)[0]
    rca_rep = rca.analyze(inc, recent_logs=["OutOfMemory buffer leak detected"])
    plan = planner.plan_remediation(inc, rca_rep, target_service="worker-svc")
    assert plan.approval_request_id is not None

    # 1. Default OBSERVE mode: records shadow intent without live execution
    observe_manager.set_trust_mode(TrustMode.OBSERVE, agent_id="ops-executor", task_id=inc.incident_id)
    res_obs = executor.execute_plan(plan)
    assert res_obs["ok"] is True
    assert res_obs["status"] == "shadow_recorded_observe_mode"
    assert len(res_obs["shadow_intent_ids"]) > 0

    # 2. Promote to AUTO mode and approve plan
    from app.platform.approval import approval_gate
    observe_manager.set_trust_mode(TrustMode.AUTO, agent_id="ops-executor", task_id=inc.incident_id)
    approval_gate.approve(plan.approval_request_id, "director", plan.approval_token)

    res_live = executor.execute_plan(plan)
    assert res_live["ok"] is True
    assert res_live["status"] == "executed"
    assert res_live["mode"] == "auto"


def test_ops_orchestrator_end_to_end_cycle():
    orchestrator = OpsPipelineOrchestrator()

    # Trigger simulated CPU anomaly
    sim_metrics = {"cpu_usage_pct": 94.0, "memory_usage_pct": 40.0, "error_rate_pct": 0.5}

    # Execute complete recovery cycle with auto_approve=True
    cycle_res = orchestrator.run_ops_cycle(
        simulated_metrics=sim_metrics,
        recent_logs=["Worker thread contention elevated"],
        auto_approve=True,
    )

    assert cycle_res["status"] == "incident_resolved"
    assert cycle_res["health_check"].recovered is True
    assert cycle_res["health_check"].is_healthy is True
    assert cycle_res["evidence_summary"]["valid"] is True
