"""
Evolution package for NEXUS CORE 2.0.
Provides telemetry diagnostics, sandbox verification, approval gates, and rollback.
"""
from app.evolution.analyzer import analyze_and_propose_evolutions
from app.evolution.sandbox import verify_proposal_in_sandbox
from app.evolution.manager import (
    approve_and_apply,
    reject_proposal,
    rollback_proposal,
    EvolutionApprovalError,
    EvolutionRollbackError
)

from app.evolution.sweeper import AutonomousEvolutionSweeper, sweeper
from app.evolution.observer import ObserveModeManager, ShadowActionIntent, TrustMode, observe_manager
from app.evolution.watchdog import LivelockDiagnosis, SemanticWatchdog, semantic_watchdog

__all__ = [
    "analyze_and_propose_evolutions",
    "verify_proposal_in_sandbox",
    "approve_and_apply",
    "reject_proposal",
    "rollback_proposal",
    "EvolutionApprovalError",
    "EvolutionRollbackError",
    "AutonomousEvolutionSweeper",
    "sweeper",
    "ObserveModeManager",
    "observe_manager",
    "TrustMode",
    "ShadowActionIntent",
    "SemanticWatchdog",
    "semantic_watchdog",
    "LivelockDiagnosis",
]
