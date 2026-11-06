"""
Unit & Integration Tests for NEXUS CORE 2.1 — 3 Killer Features (§Evolution-DSH).
Validates:
1. Observe Mode: Shadow intent recording, dry-run safety, and progressive trust promotion to AUTO.
2. Ticket/Assignment Decoupling & Thread Pub/Sub: Mid-flight user steering ingestion without restarting DAG.
3. Semantic Watchdog: "Alive but Stuck" livelock detection (semantic repetition & token burn velocity).
"""

import pytest
from app.evolution.observer import ObserveModeManager, TrustMode
from app.b1.thread import MessagePriority, ThreadHub
from app.evolution.watchdog import SemanticWatchdog
from app.platform.policy import RiskLevel


def test_observe_mode_progressive_trust():
    mgr = ObserveModeManager()
    agent_id = "newbie-agent"
    task_id = "task-obs-001"

    # Default is OBSERVE mode
    assert mgr.get_trust_mode(agent_id, task_id) == TrustMode.OBSERVE

    # Record shadow intent (e.g. agent intends to delete log file)
    intent = mgr.record_shadow_intent(
        task_id=task_id,
        agent_id=agent_id,
        action_type="custom",
        command="rm -rf /tmp/test_logs",
        parameters={"path": "/tmp/test_logs"},
        preview_summary="Would purge temporary test logs",
        estimated_tokens=250,
    )
    assert intent.status == "shadow_recorded"
    assert intent.predicted_risk_level == RiskLevel.L3_DESTRUCTIVE
    assert len(mgr.list_intents(task_id=task_id)) == 1

    # Human promotes intent to AUTO
    promoted = mgr.promote_to_auto(intent.intent_id, operator_identity="lead_architect")
    assert promoted.status == "promoted"
    assert promoted.promoted_by == "lead_architect"

    # Mode is now upgraded to AUTO
    assert mgr.get_trust_mode(agent_id, task_id) == TrustMode.AUTO


def test_ticket_assignment_decoupling_and_thread_steering():
    hub = ThreadHub()
    ticket_id = "ticket-feat-999"
    agent_id = "coding-worker-1"

    # 1. Create active assignment session
    assignment = hub.create_assignment(ticket_id, agent_id)
    assert assignment.status == "running"
    assert assignment.ticket_id == ticket_id

    # 2. Worker starts running. Mid-flight, user adds an instruction to the thread
    msg1 = hub.send_thread_message(
        ticket_id=ticket_id,
        content="Wait, remember to add CORS middleware and rate limiting!",
        sender="user",
        priority=MessagePriority.HIGH,
    )
    assert msg1.consumed is False

    # 3. Worker reaches checkpoint and polls thread messages
    unread = hub.poll_unconsumed_messages(ticket_id, assignment_id=assignment.assignment_id)
    assert len(unread) == 1
    assert unread[0].message_id == msg1.message_id
    assert unread[0].consumed is True
    assert unread[0].consumed_by_assignment_id == assignment.assignment_id

    # 4. Subsequent poll has no unconsumed messages
    assert len(hub.poll_unconsumed_messages(ticket_id, assignment_id=assignment.assignment_id)) == 0

    # 5. Complete assignment
    hub.complete_assignment(assignment.assignment_id)
    assert hub.get_assignment(assignment.assignment_id).status == "completed"


def test_semantic_livelock_watchdog():
    watchdog = SemanticWatchdog(repetition_threshold=0.80)
    worker_id = "worker-stuck-007"

    # 1. Normal heartbeats with progressing thoughts
    watchdog.record_heartbeat(worker_id, 1, "parse_input", "Parsing incoming json schema", tokens_spent=100, output_chars=200)
    watchdog.record_heartbeat(worker_id, 2, "generate_sql", "Generating DDL migration script", tokens_spent=150, output_chars=350)
    watchdog.record_heartbeat(worker_id, 3, "run_migration", "Executing migration against test database", tokens_spent=200, output_chars=180)

    diag_normal = watchdog.diagnose_worker(worker_id)
    assert not diag_normal.is_livelocked
    assert diag_normal.recommended_intervention == "continue"

    # 2. Simulate Livelock: Worker gets stuck in repetitive loop
    watchdog.clear_worker(worker_id)
    watchdog.record_heartbeat(worker_id, 1, "retry_call", "Error connecting to service trying port 8000 again", tokens_spent=800, output_chars=10)
    watchdog.record_heartbeat(worker_id, 2, "retry_call", "Error connecting to service trying port 8000 again immediately", tokens_spent=850, output_chars=10)
    watchdog.record_heartbeat(worker_id, 3, "retry_call", "Error connecting to service trying port 8000 again now", tokens_spent=900, output_chars=10)

    diag_stuck = watchdog.diagnose_worker(worker_id)
    assert diag_stuck.is_livelocked is True
    assert "repetitive semantic loop" in diag_stuck.diagnosis_reason
    assert diag_stuck.recommended_intervention == "inject_negative_feedback"
    assert len(watchdog.get_intervention_history(worker_id)) >= 1

    # 3. Simulate High Token Burn with Zero Progress
    worker_burn = "worker-burn-008"
    watchdog.record_heartbeat(worker_burn, 1, "step1", "Long reasoning about universe A", tokens_spent=2000, output_chars=0)
    watchdog.record_heartbeat(worker_burn, 2, "step2", "Different reasoning about universe B", tokens_spent=2000, output_chars=5)
    watchdog.record_heartbeat(worker_burn, 3, "step3", "Third thought about universe C", tokens_spent=2000, output_chars=2)

    diag_burn = watchdog.diagnose_worker(worker_burn)
    assert diag_burn.is_livelocked is True
    assert "High token burn" in diag_burn.diagnosis_reason
    assert diag_burn.recommended_intervention == "abort_step"
