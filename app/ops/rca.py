"""
NEXUS CORE 2.1 — NEXUS OPS Root Cause Analysis (RCA) Engine (§OPS-4).
Correlates anomaly symptoms, logs, and system events to infer the primary root cause.
"""

from typing import Any, Dict, List, Optional
from app.ops.schemas import Incident, RootCauseReport


class RootCauseAnalyzer:
    """
    Performs deterministic and heuristic correlation to identify failure root causes.
    """

    def analyze(self, incident: Incident, recent_logs: Optional[List[str]] = None) -> RootCauseReport:
        logs = recent_logs or []
        factors: List[str] = []
        indicators: List[str] = []

        metric = incident.trigger_metric
        val = incident.metric_value

        if metric == "memory_usage_pct":
            if any("OutOfMemory" in l or "leak" in l.lower() for l in logs):
                hypothesis = "Process memory leak in background worker pool."
                confidence = 0.92
                factors.append("Log traces show recurring allocation without garbage collection")
            elif incident.context.get("active_connections", 0) > 100:
                hypothesis = "Connection pool exhaustion causing runaway buffer allocation."
                confidence = 0.85
                factors.append(f"Connection count ({incident.context.get('active_connections')}) exceeded normal bounds")
            else:
                hypothesis = "Resident memory saturation due to heavy cache accumulation."
                confidence = 0.78
            indicators.append(f"Memory reached {val}% exceeding threshold {incident.threshold}%")

        elif metric == "cpu_usage_pct":
            if any("regex" in l.lower() or "catastrophic" in l.lower() for l in logs):
                hypothesis = "ReDoS (Catastrophic Regular Expression backtracking) CPU livelock."
                confidence = 0.90
                factors.append("Matching regex backtrack signatures found in recent logs")
            else:
                hypothesis = "Unoptimized query or thread contention under elevated concurrency."
                confidence = 0.80
            indicators.append(f"CPU sustained load {val}%")

        elif metric == "error_rate_pct":
            if any("connection refused" in l.lower() or "502" in l or "504" in l for l in logs):
                hypothesis = "Upstream downstream microservice or DB gateway unreachable."
                confidence = 0.95
                factors.append("Gateway connection refused errors detected in reverse proxy")
            else:
                hypothesis = "Unhandled NullPointer or schema serialization exception after recent deploy."
                confidence = 0.82
            indicators.append(f"Error rate {val}% breached threshold {incident.threshold}%")

        else:
            hypothesis = f"Resource exhaustion on {metric}."
            confidence = 0.70
            indicators.append(f"Metric {metric} reached {val}")

        return RootCauseReport(
            incident_id=incident.incident_id,
            root_cause_hypothesis=hypothesis,
            confidence=confidence,
            contributing_factors=factors,
            evidence_indicators=indicators,
        )
