"""
Autonomous Evolution Sweeper for NEXUS CORE 2.0.
Periodically scans system telemetry, identifies degradation or bottlenecks,
automatically runs multi-stage sandbox verification, and queues qualified
proposals for human-in-the-loop gated approval.
"""
import threading
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy.orm import Session
from app.evolution.analyzer import analyze_and_propose_evolutions
from app.evolution.sandbox import verify_proposal_in_sandbox
from app.models import EvolutionProposal

logger = logging.getLogger("nexus.evolution.sweeper")


class AutonomousEvolutionSweeper:
    def __init__(self, interval_seconds: int = 300, enabled: bool = True):
        self.interval_seconds = interval_seconds
        self.enabled = enabled
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._session_factory = None
        self.total_sweeps = 0
        self.last_sweep_at: Optional[datetime] = None
        self.last_sweep_result: Optional[Dict[str, Any]] = None

    def set_session_factory(self, session_factory):
        self._session_factory = session_factory

    def start(self):
        if not self.enabled:
            logger.info("AutonomousEvolutionSweeper is disabled by configuration.")
            return

        if self._thread and self._thread.is_alive():
            logger.warning("AutonomousEvolutionSweeper is already running.")
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="nexus-evolution-sweeper")
        self._thread.start()
        logger.info(f"AutonomousEvolutionSweeper started (interval: {self.interval_seconds}s)")

    def stop(self):
        if self._thread and self._thread.is_alive():
            self._stop_event.set()
            self._thread.join(timeout=5)
            logger.info("AutonomousEvolutionSweeper stopped.")

    def _run_loop(self):
        while not self._stop_event.is_set():
            # Wait for next interval or stop signal
            if self._stop_event.wait(timeout=self.interval_seconds):
                break

            if not self._session_factory:
                continue

            try:
                db: Session = self._session_factory()
                try:
                    self.execute_sweep(db)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Error during autonomous evolution sweep: {e}", exc_info=True)

    def execute_sweep(self, db: Session) -> Dict[str, Any]:
        """
        Executes a single autonomous diagnosis and sandbox verification sweep.
        """
        start_time = time.time()
        self.total_sweeps += 1
        self.last_sweep_at = datetime.now(timezone.utc)

        # 1. Analyze telemetry and generate proposals
        proposals: List[EvolutionProposal] = analyze_and_propose_evolutions(db)
        
        verified_count = 0
        failed_count = 0

        # 2. Automatically ensure sandbox verification for each proposal
        for p in proposals:
            if p.status in ("draft", "pending_test"):
                test_result = verify_proposal_in_sandbox(p)
                p.sandbox_test_result = test_result
                if test_result.get("test_passed"):
                    p.status = "pending_approval"
                    verified_count += 1
                    logger.info(f"Sweeper: Proposal #{p.id} passed sandbox verification and queued for human approval.")
                else:
                    p.status = "sandbox_failed"
                    failed_count += 1
                    logger.warning(f"Sweeper: Proposal #{p.id} failed sandbox test: {test_result.get('error')}")
            elif p.status == "test_passed":
                p.status = "pending_approval"
                verified_count += 1
                logger.info(f"Sweeper: Proposal #{p.id} verified and queued for human approval.")
            elif p.status == "test_failed":
                failed_count += 1
                db.commit()

        duration = round(time.time() - start_time, 3)
        summary = {
            "sweep_id": self.total_sweeps,
            "timestamp": self.last_sweep_at.isoformat(),
            "duration_seconds": duration,
            "new_proposals_found": len(proposals),
            "verified_pending_approval": verified_count,
            "sandbox_failed": failed_count,
        }
        self.last_sweep_result = summary
        logger.info(f"Sweep #{self.total_sweeps} finished in {duration}s: {summary}")
        return summary

    def get_status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "is_running": self._thread.is_alive() if self._thread else False,
            "interval_seconds": self.interval_seconds,
            "total_sweeps": self.total_sweeps,
            "last_sweep_at": self.last_sweep_at.isoformat() if self.last_sweep_at else None,
            "last_sweep_result": self.last_sweep_result,
        }


# Global singleton instance
sweeper = AutonomousEvolutionSweeper(interval_seconds=300, enabled=True)
