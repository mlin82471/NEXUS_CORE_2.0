"""
NEXUS CORE 2.1 — Progressive Trust & Observe Mode Engine (§Evolution-Observe).
Provides a shadow observation mode where agents record intended actions without live execution,
enabling gradual human trust elevation from OBSERVE to AUTO mode.
"""

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from app.platform.policy import RiskLevel, policy_engine


class TrustMode(str, Enum):
    OBSERVE = "observe"  # Shadow execution: plan and predict only, no live side-effects
    AUTO = "auto"        # Full execution: live writes and commands allowed within policy


@dataclass
class ShadowActionIntent:
    intent_id: str
    task_id: str
    agent_id: str
    action_type: str
    target_path: Optional[str]
    command: Optional[str]
    parameters: Dict[str, Any]
    predicted_risk_level: RiskLevel
    predicted_tokens: int
    preview_summary: str
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "shadow_recorded"  # "shadow_recorded" | "promoted" | "rejected"
    promoted_at: Optional[str] = None
    promoted_by: Optional[str] = None


class ObserveModeManager:
    """
    Manages shadow execution intent recording and progressive trust promotion.
    """

    def __init__(self):
        self._intents: Dict[str, ShadowActionIntent] = {}
        self._agent_trust_modes: Dict[str, TrustMode] = {}  # agent_id -> TrustMode
        self._task_trust_modes: Dict[str, TrustMode] = {}   # task_id -> TrustMode

    def get_trust_mode(self, agent_id: str, task_id: Optional[str] = None) -> TrustMode:
        """
        Determines current trust mode.
        If task_id is specified, task trust mode takes precedence.
        Otherwise falls back to agent trust mode, defaulting to OBSERVE for safety.
        """
        if task_id and task_id in self._task_trust_modes:
            return self._task_trust_modes[task_id]
        return self._agent_trust_modes.get(agent_id, TrustMode.OBSERVE)

    def set_trust_mode(self, mode: TrustMode, agent_id: Optional[str] = None, task_id: Optional[str] = None) -> None:
        if task_id:
            self._task_trust_modes[task_id] = mode
        if agent_id:
            self._agent_trust_modes[agent_id] = mode

    def record_shadow_intent(
        self,
        task_id: str,
        agent_id: str,
        action_type: str,
        parameters: Dict[str, Any],
        preview_summary: str,
        target_path: Optional[str] = None,
        command: Optional[str] = None,
        estimated_tokens: int = 100,
    ) -> ShadowActionIntent:
        """
        Records an agent's intended action in Observe mode without touching live systems.
        """
        risk = policy_engine.evaluate_risk(
            action_type=action_type,
            target_path=target_path,
            command=command,
            parameters=parameters,
        )

        intent_id = f"intent-{uuid.uuid4().hex[:8]}"
        intent = ShadowActionIntent(
            intent_id=intent_id,
            task_id=task_id,
            agent_id=agent_id,
            action_type=action_type,
            target_path=target_path,
            command=command,
            parameters=parameters,
            predicted_risk_level=risk,
            predicted_tokens=estimated_tokens,
            preview_summary=preview_summary,
        )
        self._intents[intent_id] = intent
        return intent

    def promote_to_auto(self, intent_id: str, operator_identity: str) -> ShadowActionIntent:
        """
        Operator reviews the shadow intent and elevates trust, promoting it to AUTO.
        """
        intent = self._intents.get(intent_id)
        if not intent:
            raise ValueError(f"Shadow intent '{intent_id}' not found")

        intent.status = "promoted"
        intent.promoted_at = datetime.now(timezone.utc).isoformat()
        intent.promoted_by = operator_identity

        # Upgrade agent & task trust mode to AUTO
        self.set_trust_mode(TrustMode.AUTO, agent_id=intent.agent_id, task_id=intent.task_id)
        return intent

    def list_intents(self, task_id: Optional[str] = None, status: Optional[str] = None) -> List[ShadowActionIntent]:
        res = list(self._intents.values())
        if task_id:
            res = [i for i in res if i.task_id == task_id]
        if status:
            res = [i for i in res if i.status == status]
        return res


# Global singleton instance
observe_manager = ObserveModeManager()
