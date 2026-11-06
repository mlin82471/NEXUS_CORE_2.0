"""
NEXUS CORE 2.1 — NEXUS OPS Post-Remediation Health Verifier (§OPS-7).
Compares telemetry before and after execution to objectively certify system recovery.
"""

from typing import Any, Dict
from app.ops.schemas import HealthCheckResult, RemediationPlan, TelemetrySnapshot


class HealthVerifier:
    """
    Validates that system metrics normalized and returned to healthy SLA bounds.
    """

    def verify_recovery(
        self,
        plan: RemediationPlan,
        telemetry_before: TelemetrySnapshot,
        telemetry_after: TelemetrySnapshot,
    ) -> HealthCheckResult:
        metrics_before = {
            "cpu_usage_pct": telemetry_before.cpu_usage_pct,
            "memory_usage_pct": telemetry_before.memory_usage_pct,
            "disk_usage_pct": telemetry_before.disk_usage_pct,
            "error_rate_pct": telemetry_before.error_rate_pct,
        }
        metrics_after = {
            "cpu_usage_pct": telemetry_after.cpu_usage_pct,
            "memory_usage_pct": telemetry_after.memory_usage_pct,
            "disk_usage_pct": telemetry_after.disk_usage_pct,
            "error_rate_pct": telemetry_after.error_rate_pct,
        }

        # Check if the trigger metric has improved below safe levels
        recovered = True
        notes = []

        if telemetry_before.memory_usage_pct > 88.0:
            if telemetry_after.memory_usage_pct < 80.0:
                notes.append(f"Memory normalized: {telemetry_before.memory_usage_pct}% -> {telemetry_after.memory_usage_pct}%")
            else:
                recovered = False
                notes.append(f"Memory remains high: {telemetry_after.memory_usage_pct}%")

        if telemetry_before.cpu_usage_pct > 85.0:
            if telemetry_after.cpu_usage_pct < 65.0:
                notes.append(f"CPU normalized: {telemetry_before.cpu_usage_pct}% -> {telemetry_after.cpu_usage_pct}%")
            else:
                recovered = False
                notes.append(f"CPU load remains elevated: {telemetry_after.cpu_usage_pct}%")

        if telemetry_before.error_rate_pct > 4.0:
            if telemetry_after.error_rate_pct < 1.0:
                notes.append(f"Error rate normalized: {telemetry_before.error_rate_pct}% -> {telemetry_after.error_rate_pct}%")
            else:
                recovered = False
                notes.append(f"Error rate still high: {telemetry_after.error_rate_pct}%")

        is_healthy = recovered and (telemetry_after.error_rate_pct < 2.0 and telemetry_after.memory_usage_pct < 85.0)

        return HealthCheckResult(
            is_healthy=is_healthy,
            recovered=recovered,
            metrics_before=metrics_before,
            metrics_after=metrics_after,
            verification_notes="; ".join(notes) if notes else "All metrics in nominal operational range.",
        )
