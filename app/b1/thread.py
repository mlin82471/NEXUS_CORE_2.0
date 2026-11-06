"""
NEXUS CORE 2.1 — Decoupled Ticket & Assignment with Dynamic Thread Hub (§B1-Thread).
Decouples high-level task goals (Tickets) from active execution sessions (Assignments),
allowing running workers to subscribe to mid-flight thread event streams.
Users can inject mid-flight guidance without restarting the entire DAG.
"""

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class MessagePriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"  # Immediate mid-flight context override


@dataclass
class ThreadMessage:
    message_id: str
    ticket_id: str
    sender: str  # "user" | "supervisor" | "system" | "agent"
    content: str
    priority: MessagePriority = MessagePriority.NORMAL
    payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    consumed: bool = False
    consumed_by_assignment_id: Optional[str] = None


@dataclass
class AssignmentSession:
    assignment_id: str
    ticket_id: str
    agent_id: str
    status: str = "running"  # "running" | "completed" | "paused" | "failed"
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    accumulated_context: Dict[str, Any] = field(default_factory=dict)
    applied_thread_messages: List[str] = field(default_factory=list)


class ThreadHub:
    """
    Central pub/sub message bus for Ticket threads and active Assignment steering.
    """

    def __init__(self):
        self._threads: Dict[str, List[ThreadMessage]] = {}       # ticket_id -> List[ThreadMessage]
        self._assignments: Dict[str, AssignmentSession] = {}     # assignment_id -> AssignmentSession
        self._ticket_assignments: Dict[str, List[str]] = {}      # ticket_id -> List[assignment_id]

    def create_assignment(self, ticket_id: str, agent_id: str) -> AssignmentSession:
        assignment_id = f"asgn-{uuid.uuid4().hex[:8]}"
        session = AssignmentSession(
            assignment_id=assignment_id,
            ticket_id=ticket_id,
            agent_id=agent_id,
        )
        self._assignments[assignment_id] = session
        if ticket_id not in self._ticket_assignments:
            self._ticket_assignments[ticket_id] = []
        self._ticket_assignments[ticket_id].append(assignment_id)
        return session

    def send_thread_message(
        self,
        ticket_id: str,
        content: str,
        sender: str = "user",
        priority: MessagePriority = MessagePriority.NORMAL,
        payload: Optional[Dict[str, Any]] = None,
    ) -> ThreadMessage:
        """
        Inject a mid-flight instruction into a running ticket thread.
        """
        msg_id = f"msg-{uuid.uuid4().hex[:8]}"
        msg = ThreadMessage(
            message_id=msg_id,
            ticket_id=ticket_id,
            sender=sender,
            content=content,
            priority=priority,
            payload=payload or {},
        )
        if ticket_id not in self._threads:
            self._threads[ticket_id] = []
        self._threads[ticket_id].append(msg)
        return msg

    def poll_unconsumed_messages(
        self,
        ticket_id: str,
        assignment_id: Optional[str] = None,
    ) -> List[ThreadMessage]:
        """
        Running workers call this between subtask steps to ingest mid-flight steering.
        """
        messages = self._threads.get(ticket_id, [])
        unconsumed = [m for m in messages if not m.consumed]
        for m in unconsumed:
            m.consumed = True
            m.consumed_by_assignment_id = assignment_id
            if assignment_id and assignment_id in self._assignments:
                self._assignments[assignment_id].applied_thread_messages.append(m.message_id)
        return unconsumed

    def get_thread_history(self, ticket_id: str) -> List[ThreadMessage]:
        return self._threads.get(ticket_id, [])

    def get_assignment(self, assignment_id: str) -> Optional[AssignmentSession]:
        return self._assignments.get(assignment_id)

    def complete_assignment(self, assignment_id: str, status: str = "completed") -> None:
        session = self._assignments.get(assignment_id)
        if session:
            session.status = status
            session.completed_at = datetime.now(timezone.utc).isoformat()


# Global singleton instance
thread_hub = ThreadHub()
