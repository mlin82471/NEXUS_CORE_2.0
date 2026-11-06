"""
NEXUS CORE 2.0 — B1 Planner 2.0
Converts user goals into structured SubTask lists.
Conforms to B0 SubTaskData contract.

Public API:
    plan(goal, budget, context=None) -> list[SubTaskData]
    replan(task_goal, failed_subtasks, verifier_issues, budget, persistence=None) -> list[SubTaskData]
    rule_plan(goal, role) -> list[SubTaskData]
"""
from app.b1.planner import plan, replan, rule_plan
from app.b1.thread import (
    AssignmentSession,
    MessagePriority,
    ThreadHub,
    ThreadMessage,
    thread_hub,
)

__all__ = [
    "plan",
    "replan",
    "rule_plan",
    "thread_hub",
    "ThreadHub",
    "ThreadMessage",
    "AssignmentSession",
    "MessagePriority",
]
