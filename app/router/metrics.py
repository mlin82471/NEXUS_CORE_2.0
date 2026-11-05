"""
NEXUS CORE 2.0 — Agent Performance & Metrics Tracker (§3 & §M2)
Records execution telemetry to enable continuous evaluation and optimal dispatch.
"""
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.models import AgentRun, Agent


def record_agent_execution(
    db: Session,
    agent_id: str,
    status: str,
    input_tokens: int,
    output_tokens: int,
    execution_time_ms: int = 0,
) -> None:
    """Updates telemetry in metadata_json of the Agent record."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        return

    meta = dict(agent.metadata_json or {})
    telemetry = dict(meta.get("telemetry", {
        "total_calls": 0,
        "success_calls": 0,
        "failed_calls": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_time_ms": 0,
    }))

    telemetry["total_calls"] += 1
    if status == "success":
        telemetry["success_calls"] += 1
    else:
        telemetry["failed_calls"] += 1

    telemetry["total_input_tokens"] += int(input_tokens or 0)
    telemetry["total_output_tokens"] += int(output_tokens or 0)
    telemetry["total_time_ms"] += int(execution_time_ms or 0)

    # Success rate
    tot = telemetry["total_calls"]
    telemetry["success_rate"] = round(telemetry["success_calls"] / tot, 3) if tot > 0 else 1.0

    meta["telemetry"] = telemetry
    agent.metadata_json = meta
    flag_modified(agent, "metadata_json")
    db.commit()


def get_agent_metrics(db: Session) -> List[Dict[str, Any]]:
    """Returns aggregated performance metrics for all agents."""
    agents = db.query(Agent).all()
    results = []
    for a in agents:
        meta = a.metadata_json or {}
        telemetry = meta.get("telemetry", {
            "total_calls": 0,
            "success_calls": 0,
            "failed_calls": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_time_ms": 0,
            "success_rate": 1.0,
        })
        results.append({
            "agent_id": a.id,
            "agent_name": a.name,
            "role": a.role,
            "adapter_type": a.adapter_type,
            "enabled": a.enabled,
            "verification_status": a.verification_status,
            "telemetry": telemetry,
        })
    return results
