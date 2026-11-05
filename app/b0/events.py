"""
NEXUS CORE 2.0 — B0 Event Protocol & Concurrency (§6)
"""
import json
import sqlite3
import time
import uuid
from typing import Any, Mapping

class EventSequenceConflictError(Exception):
    """Raised when sequence allocation fails repeatedly due to concurrent write collisions."""
    pass

class EventWriteError(Exception):
    """Raised when SQLite locks cannot be resolved within retry limits."""
    pass

def write_event(
    conn: sqlite3.Connection,
    task_id: str,
    event_type: str,
    actor_type: str,
    actor_id: str | None = None,
    subtask_id: str | None = None,
    payload: Mapping[str, Any] | None = None,
    max_attempts: int = 5,
) -> int:
    """Allocate the next sequence number and write an event under BEGIN IMMEDIATE transaction per §6.1.
    Retries on SQLITE_BUSY / locked database with exponential backoff.
    Returns the assigned event sequence number.
    """
    event_id = str(uuid.uuid4())
    payload_json = json.dumps(dict(payload or {}))

    for attempt in range(max_attempts):
        try:
            # Reserve write lock immediately to prevent sequence collision
            conn.execute("BEGIN IMMEDIATE")
            
            cursor = conn.execute(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM task_events WHERE task_id = ?",
                (task_id,),
            )
            seq = cursor.fetchone()[0]

            conn.execute(
                """
                INSERT INTO task_events (
                    event_id, task_id, sequence, event_type,
                    actor_type, actor_id, subtask_id, payload
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (event_id, task_id, seq, event_type, actor_type, actor_id, subtask_id, payload_json),
            )
            conn.commit()
            return seq

        except sqlite3.IntegrityError:
            conn.rollback()
            if attempt == max_attempts - 1:
                raise EventSequenceConflictError(
                    f"Sequence conflict for task {task_id} after {max_attempts} attempts"
                )
            time.sleep(0.02 * (2 ** attempt))

        except sqlite3.OperationalError as e:
            conn.rollback()
            if "locked" in str(e).lower() or "busy" in str(e).lower():
                if attempt == max_attempts - 1:
                    raise EventWriteError(
                        f"Database locked (SQLITE_BUSY) writing event for task {task_id} after {max_attempts} attempts"
                    ) from e
                time.sleep(0.03 * (2 ** attempt))
            else:
                raise

    raise EventWriteError(f"Failed to write event for task {task_id}")
