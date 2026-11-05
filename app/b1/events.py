"""
B1 Event System Adapter implementing B0.EventProtocol (§10.5, §6.1).
Ensures BEGIN IMMEDIATE and retry on SQLITE_BUSY via app.b0.events.write_event.
"""
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from app.b0.events import write_event as b0_write_event
from app.b0.protocols import EventProtocol, TaskEventData


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteEventSystem(EventProtocol):
    """
    Adapter implementing EventProtocol backed by SQLite task_events table.
    Delegates sequence allocation and concurrency write locks to B0 write_event.
    """

    def __init__(self, db_path: str):
        self.db_path = db_path

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def write_event(
        self,
        task_id: str,
        event_type: str,
        actor_type: str,
        actor_id: str | None = None,
        subtask_id: str | None = None,
        payload: dict | None = None,
    ) -> TaskEventData:
        conn = self._get_conn()
        try:
            seq = b0_write_event(
                conn,
                task_id=task_id,
                event_type=event_type,
                actor_type=actor_type,
                actor_id=actor_id,
                subtask_id=subtask_id,
                payload=payload,
            )
            return TaskEventData(
                event_id="",  # generated inside B0
                task_id=task_id,
                sequence=seq,
                event_type=event_type,
                actor_type=actor_type,
                actor_id=actor_id,
                subtask_id=subtask_id,
                payload=payload or {},
                timestamp=_now(),
            )
        finally:
            conn.close()

    def get_events_for_task(self, task_id: str) -> list[TaskEventData]:
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM task_events WHERE task_id = ? ORDER BY sequence",
                (task_id,),
            ).fetchall()
            return [
                TaskEventData(
                    event_id=r["event_id"],
                    task_id=r["task_id"],
                    sequence=r["sequence"],
                    event_type=r["event_type"],
                    actor_type=r["actor_type"],
                    actor_id=r["actor_id"],
                    subtask_id=r["subtask_id"],
                    payload=json.loads(r["payload"]) if r["payload"] else {},
                    schema_version=r["schema_version"],
                    timestamp=r["timestamp"],
                )
                for r in rows
            ]
        finally:
            conn.close()
