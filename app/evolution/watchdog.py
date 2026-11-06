"""
NEXUS CORE 2.1 — Semantic Livelock Watchdog (§Evolution-Watchdog).
Detects "Alive but Stuck" worker livelocks (repetition loops, token burn with zero progress, state oscillation).
Provides dynamic intervention: negative feedback injection, step pauses, and automated plan replanning.
"""

import re
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass
class WorkerHeartbeat:
    step_index: int
    step_name: str
    thought_snippet: str
    tokens_spent: int
    output_chars: int
    timestamp: float = field(default_factory=time.time)


@dataclass
class LivelockDiagnosis:
    worker_id: str
    is_livelocked: bool
    repetition_index: float  # 0.0 (unique) to 1.0 (identical repetition)
    token_burn_velocity: float
    diagnosis_reason: str
    recommended_intervention: str  # "continue" | "inject_negative_feedback" | "abort_step"


class SemanticWatchdog:
    """
    Semantic Livelock Watchdog.
    Monitors running workers for unproductive cycles without throwing unhandled exceptions.
    """

    def __init__(self, max_history: int = 10, repetition_threshold: float = 0.82):
        self.max_history = max_history
        self.repetition_threshold = repetition_threshold
        self._heartbeats: Dict[str, deque[WorkerHeartbeat]] = {}  # worker_id -> deque
        self._interventions: Dict[str, List[LivelockDiagnosis]] = {}

    def record_heartbeat(
        self,
        worker_id: str,
        step_index: int,
        step_name: str,
        thought: str,
        tokens_spent: int = 100,
        output_chars: int = 50,
    ) -> WorkerHeartbeat:
        if worker_id not in self._heartbeats:
            self._heartbeats[worker_id] = deque(maxlen=self.max_history)

        clean_thought = re.sub(r"\s+", " ", thought.strip())
        hb = WorkerHeartbeat(
            step_index=step_index,
            step_name=step_name,
            thought_snippet=clean_thought,
            tokens_spent=tokens_spent,
            output_chars=output_chars,
        )
        self._heartbeats[worker_id].append(hb)
        return hb

    def diagnose_worker(self, worker_id: str) -> LivelockDiagnosis:
        history = list(self._heartbeats.get(worker_id, []))
        if len(history) < 3:
            return LivelockDiagnosis(
                worker_id=worker_id,
                is_livelocked=False,
                repetition_index=0.0,
                token_burn_velocity=0.0,
                diagnosis_reason="Insufficient execution history (need >= 3 steps)",
                recommended_intervention="continue",
            )

        # 1. Semantic Thought Repetition (Jaccard similarity across consecutive thoughts)
        recent_3 = history[-3:]
        sim_1_2 = self._jaccard_similarity(recent_3[0].thought_snippet, recent_3[1].thought_snippet)
        sim_2_3 = self._jaccard_similarity(recent_3[1].thought_snippet, recent_3[2].thought_snippet)
        avg_sim = round((sim_1_2 + sim_2_3) / 2.0, 3)

        # 2. Token Burn with Zero/Negligible Output Progress
        total_tokens = sum(h.tokens_spent for h in recent_3)
        total_chars = sum(h.output_chars for h in recent_3)
        burn_velocity = round(total_tokens / max(1, total_chars), 2)

        # 3. Decision Logic
        is_livelocked = False
        reason = "Normal execution rhythm"
        action = "continue"

        if avg_sim >= self.repetition_threshold:
            is_livelocked = True
            reason = f"Agent alive but stuck in repetitive semantic loop (repetition index {avg_sim:.2f})"
            action = "inject_negative_feedback"
        elif total_tokens > 4000 and total_chars < 50:
            is_livelocked = True
            reason = f"High token burn ({total_tokens} tokens) with zero output velocity ({total_chars} chars)"
            action = "abort_step"

        diagnosis = LivelockDiagnosis(
            worker_id=worker_id,
            is_livelocked=is_livelocked,
            repetition_index=avg_sim,
            token_burn_velocity=burn_velocity,
            diagnosis_reason=reason,
            recommended_intervention=action,
        )

        if is_livelocked:
            if worker_id not in self._interventions:
                self._interventions[worker_id] = []
            self._interventions[worker_id].append(diagnosis)

        return diagnosis

    def _jaccard_similarity(self, s1: str, s2: str) -> float:
        w1 = set(s1.lower().split())
        w2 = set(s2.lower().split())
        if not w1 or not w2:
            return 0.0
        intersection = len(w1.intersection(w2))
        union = len(w1.union(w2))
        return intersection / union if union > 0 else 0.0

    def get_intervention_history(self, worker_id: str) -> List[LivelockDiagnosis]:
        return self._interventions.get(worker_id, [])

    def clear_worker(self, worker_id: str) -> None:
        self._heartbeats.pop(worker_id, None)
        self._interventions.pop(worker_id, None)


# Global singleton instance
semantic_watchdog = SemanticWatchdog()
