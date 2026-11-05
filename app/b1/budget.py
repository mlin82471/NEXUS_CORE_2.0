"""
B1 BudgetTracker Adapter implementing B0.BudgetProtocol (§10.5, §5, §A).
Persists reservations in SQLite reservations table and applies B0 budget formulas.
"""
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from app.b0.budget import calculate_remaining_budget, calculate_unknown_charge
from app.b0.protocols import BudgetProtocol, RemainingBudgetData, ReservationData


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteBudgetTracker(BudgetProtocol):
    """
    Budget tracker backed by SQLite reservations table.
    Enforces atomic reserve, commit, release, expire per B0 §5.
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

    def reserve(
        self, task_id: str, tokens: int, calls: int, caller_id: str, subtask_id: str | None = None
    ) -> ReservationData:
        # Pre-check available budget
        rem = self.remaining_budget(task_id)
        if rem.remaining_tokens < tokens or rem.remaining_calls < calls:
            raise ValueError(
                f"Budget insufficient: requested {tokens} tokens and {calls} calls, "
                f"but remaining is {rem.remaining_tokens} tokens and {rem.remaining_calls} calls"
            )

        res_id = str(uuid.uuid4())
        now_str = _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO reservations (
                    reservation_id, task_id, subtask_id, caller_id,
                    tokens_reserved, calls_reserved, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
                """,
                (res_id, task_id, subtask_id, caller_id, tokens, calls, now_str),
            )
        return ReservationData(
            reservation_id=res_id,
            task_id=task_id,
            caller_id=caller_id,
            tokens_reserved=tokens,
            calls_reserved=calls,
            status="PENDING",
            subtask_id=subtask_id,
            created_at=now_str,
        )

    def commit(
        self, reservation_id: str, tokens_charged: int, calls_charged: int, usage_source: str
    ) -> ReservationData:
        now_str = _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                """
                UPDATE reservations
                SET status = 'COMMITTED',
                    tokens_charged = ?,
                    calls_charged = ?,
                    usage_source = ?,
                    resolved_at = ?
                WHERE reservation_id = ? AND status = 'PENDING'
                """,
                (tokens_charged, calls_charged, usage_source, now_str, reservation_id),
            )
            if cur.rowcount == 0:
                raise ValueError(
                    f"Reservation not in PENDING status or does not exist: {reservation_id}"
                )
        return self._get_reservation(reservation_id)

    def release(self, reservation_id: str) -> None:
        now_str = _now()
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                """
                UPDATE reservations
                SET status = 'RELEASED',
                    tokens_charged = 0,
                    calls_charged = 0,
                    resolved_at = ?
                WHERE reservation_id = ? AND status = 'PENDING'
                """,
                (now_str, reservation_id),
            )
            if cur.rowcount == 0:
                raise ValueError(
                    f"Reservation not in PENDING status or does not exist: {reservation_id}"
                )

    def expire(self, reservation_id: str) -> None:
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                """
                UPDATE reservations
                SET status = 'EXPIRED'
                WHERE reservation_id = ? AND status = 'PENDING'
                """,
                (reservation_id,),
            )
            if cur.rowcount == 0:
                raise ValueError(
                    f"Reservation not in PENDING status or does not exist: {reservation_id}"
                )

    def remaining_budget(self, task_id: str) -> RemainingBudgetData:
        with self._get_conn() as conn:
            task_row = conn.execute(
                "SELECT max_total_tokens, max_model_calls FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if not task_row:
                raise ValueError(f"Task not found: {task_id}")

            max_tokens = task_row["max_total_tokens"]
            max_calls = task_row["max_model_calls"]

            rows = conn.execute(
                "SELECT status, tokens_reserved, calls_reserved, tokens_charged, calls_charged FROM reservations WHERE task_id = ?",
                (task_id,),
            ).fetchall()
            reservations = [dict(r) for r in rows]

        budget_dict = calculate_remaining_budget(max_tokens, max_calls, reservations)
        return RemainingBudgetData(
            remaining_tokens=budget_dict["remaining_tokens"],
            remaining_calls=budget_dict["remaining_calls"],
            consumed_tokens=budget_dict["consumed_tokens"],
            consumed_calls=budget_dict["consumed_calls"],
            is_exhausted=budget_dict["is_exhausted"],
        )

    def _get_reservation(self, reservation_id: str) -> ReservationData:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM reservations WHERE reservation_id = ?", (reservation_id,)
            ).fetchone()
            if not row:
                raise ValueError(f"Reservation not found: {reservation_id}")
            return ReservationData(
                reservation_id=row["reservation_id"],
                task_id=row["task_id"],
                caller_id=row["caller_id"],
                tokens_reserved=row["tokens_reserved"],
                calls_reserved=row["calls_reserved"],
                status=row["status"],
                subtask_id=row["subtask_id"],
                input_tokens=row["input_tokens"],
                output_tokens=row["output_tokens"],
                tokens_charged=row["tokens_charged"],
                calls_charged=row["calls_charged"],
                usage_source=row["usage_source"],
                settle_fingerprint=row["settle_fingerprint"],
                created_at=row["created_at"],
                resolved_at=row["resolved_at"],
            )
