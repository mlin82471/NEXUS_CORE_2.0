"""
NEXUS CORE 2.1 — Platform Dynamic Runtime Configuration (§Platform-5).
Provides atomic CAS-based, versioned runtime configuration management.
Maintains an immutable snapshot history with zero-downtime rollback capabilities.
"""

import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.config import settings


@dataclass
class ConfigSnapshot:
    version: int
    parameters: Dict[str, Any]
    source_proposal_id: Optional[str]
    effective_at: str
    description: str


class ConfigConflictError(Exception):
    """Raised when CAS version mismatch occurs during runtime config update."""


class RuntimeConfigManager:
    """
    Centralized, thread-safe, versioned runtime configuration store.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._current_version = 1
        self._parameters: Dict[str, Any] = {
            "default_max_total_tokens": settings.default_max_total_tokens,
            "default_max_steps": settings.default_max_steps,
            "default_max_agents": settings.default_max_agents,
            "default_max_parallel": settings.default_max_parallel,
            "planner_model": settings.planner_model,
        }
        self._history: List[ConfigSnapshot] = [
            ConfigSnapshot(
                version=1,
                parameters=dict(self._parameters),
                source_proposal_id=None,
                effective_at=datetime.now(timezone.utc).isoformat(),
                description="Initial baseline configuration",
            )
        ]

    def get_current_config(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "version": self._current_version,
                "parameters": dict(self._parameters),
                "latest_snapshot_at": self._history[-1].effective_at,
            }

    def get_parameter(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._parameters.get(key, default)

    def update_config(
        self,
        expected_version: int,
        updates: Dict[str, Any],
        source_proposal_id: Optional[str] = None,
        description: str = "Runtime configuration update",
    ) -> ConfigSnapshot:
        """
        Atomically updates configuration via Compare-And-Swap (CAS).
        """
        with self._lock:
            if self._current_version != expected_version:
                raise ConfigConflictError(
                    f"CAS version conflict: expected version {expected_version}, but current version is {self._current_version}"
                )

            # Apply updates
            self._parameters.update(updates)
            self._current_version += 1

            # Sync to global settings for backward compatibility
            if "default_max_total_tokens" in updates:
                settings.default_max_total_tokens = int(updates["default_max_total_tokens"])
            if "default_max_steps" in updates:
                settings.default_max_steps = int(updates["default_max_steps"])
            if "planner_model" in updates:
                settings.planner_model = str(updates["planner_model"])

            snapshot = ConfigSnapshot(
                version=self._current_version,
                parameters=dict(self._parameters),
                source_proposal_id=source_proposal_id,
                effective_at=datetime.now(timezone.utc).isoformat(),
                description=description,
            )
            self._history.append(snapshot)
            return snapshot

    def rollback_to_version(self, target_version: int) -> ConfigSnapshot:
        """
        Rolls back configuration to a designated historical version.
        """
        with self._lock:
            target = next((s for s in self._history if s.version == target_version), None)
            if not target:
                raise ValueError(f"Historical configuration version {target_version} not found")

            self._parameters = dict(target.parameters)
            self._current_version += 1

            # Sync to global settings
            if "default_max_total_tokens" in self._parameters:
                settings.default_max_total_tokens = int(self._parameters["default_max_total_tokens"])
            if "default_max_steps" in self._parameters:
                settings.default_max_steps = int(self._parameters["default_max_steps"])
            if "planner_model" in self._parameters:
                settings.planner_model = str(self._parameters["planner_model"])

            snapshot = ConfigSnapshot(
                version=self._current_version,
                parameters=dict(self._parameters),
                source_proposal_id=f"rollback_to_v{target_version}",
                effective_at=datetime.now(timezone.utc).isoformat(),
                description=f"Rolled back to version {target_version}",
            )
            self._history.append(snapshot)
            return snapshot

    def get_history(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [asdict(s) for s in self._history]


# Global singleton instance
runtime_config = RuntimeConfigManager()
