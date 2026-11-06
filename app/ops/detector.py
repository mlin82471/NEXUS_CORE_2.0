"""
NEXUS CORE 2.1 — NEXUS OPS Automated Anomaly Detector (§OPS-3).
Identifies metric anomalies, threshold breaches, and error surges to produce Incidents.
"""

import uuid
from typing import Dict, List, Optional
from app.ops.schemas import Incident, IncidentSeverity, TelemetrySnapshot


class AnomalyDetector:
    """
    Evaluates telemetry against SLA thresholds to detect operational incidents.
    """

    def __init__(
        self,
        cpu_threshold: float = 85.0,
        memory_threshold: float = 88.0,
        disk_threshold: float = 90.0,
        error_rate_threshold: float = 4.0,
    ):
        self.cpu_threshold = cpu_threshold
        self.memory_threshold = memory_threshold
        self.disk_threshold = disk_threshold
        self.error_rate_threshold = error_rate_threshold

    def detect_anomalies(self, telemetry: TelemetrySnapshot) -> List[Incident]:
        incidents: List[Incident] = []

        # 1. Memory exhaustion
        if telemetry.memory_usage_pct >= self.memory_threshold:
            incidents.append(
                Incident(
                    incident_id=f"inc-mem-{uuid.uuid4().hex[:6]}",
                    title="Critical Memory Saturation Breach",
                    severity=IncidentSeverity.CRITICAL if telemetry.memory_usage_pct > 95.0 else IncidentSeverity.HIGH,
                    detected_at=telemetry.timestamp,
                    trigger_metric="memory_usage_pct",
                    metric_value=telemetry.memory_usage_pct,
                    threshold=self.memory_threshold,
                    description=f"Host memory usage reached {telemetry.memory_usage_pct}% (threshold: {self.memory_threshold}%)",
                    context={"active_connections": telemetry.active_connections},
                )
            )

        # 2. CPU spike
        if telemetry.cpu_usage_pct >= self.cpu_threshold:
            incidents.append(
                Incident(
                    incident_id=f"inc-cpu-{uuid.uuid4().hex[:6]}",
                    title="High CPU Utilization Anomaly",
                    severity=IncidentSeverity.HIGH if telemetry.cpu_usage_pct > 92.0 else IncidentSeverity.MEDIUM,
                    detected_at=telemetry.timestamp,
                    trigger_metric="cpu_usage_pct",
                    metric_value=telemetry.cpu_usage_pct,
                    threshold=self.cpu_threshold,
                    description=f"CPU load surged to {telemetry.cpu_usage_pct}% (threshold: {self.cpu_threshold}%)",
                    context={"active_connections": telemetry.active_connections},
                )
            )

        # 3. Error rate surge
        if telemetry.error_rate_pct >= self.error_rate_threshold:
            incidents.append(
                Incident(
                    incident_id=f"inc-err-{uuid.uuid4().hex[:6]}",
                    title="Application Error Rate Spike",
                    severity=IncidentSeverity.CRITICAL,
                    detected_at=telemetry.timestamp,
                    trigger_metric="error_rate_pct",
                    metric_value=telemetry.error_rate_pct,
                    threshold=self.error_rate_threshold,
                    description=f"HTTP 5xx/Unhandled exception rate spiked to {telemetry.error_rate_pct}% (threshold: {self.error_rate_threshold}%)",
                    context={"error_rate": telemetry.error_rate_pct},
                )
            )

        # 4. Disk capacity warning
        if telemetry.disk_usage_pct >= self.disk_threshold:
            incidents.append(
                Incident(
                    incident_id=f"inc-dsk-{uuid.uuid4().hex[:6]}",
                    title="Disk Storage Exhaustion Risk",
                    severity=IncidentSeverity.HIGH,
                    detected_at=telemetry.timestamp,
                    trigger_metric="disk_usage_pct",
                    metric_value=telemetry.disk_usage_pct,
                    threshold=self.disk_threshold,
                    description=f"Disk space consumption at {telemetry.disk_usage_pct}% (threshold: {self.disk_threshold}%)",
                )
            )

        return incidents
