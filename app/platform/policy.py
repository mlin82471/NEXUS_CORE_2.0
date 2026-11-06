"""
NEXUS CORE 2.1 — Platform Operation Policy & Risk Classification (§Platform-3).
Calculates risk levels (L0 to L3) objectively on the server side.
Agents CANNOT self-declare or lower their own risk levels.
"""

import re
from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Dict, List, Optional


class RiskLevel(IntEnum):
    L0_READ_ONLY = 0        # Query, read, diagnose (automatic execution)
    L1_REVERSIBLE = 1       # Edit code in isolated branch, run unit test (auto within sandbox)
    L2_SERVICE_CONFIG = 2   # Restart service, modify config, install dependency (requires human signoff)
    L3_DESTRUCTIVE = 3      # Drop DB, delete data, modify host credentials (strict dual-approval / default-deny)


@dataclass
class OperationPolicy:
    operation_name: str
    risk_level: RiskLevel
    requires_approval: bool
    allowed_roles: List[str]
    description: str


class PolicyEngine:
    """
    Evaluates requested actions, commands, and file operations to determine
    the objective, authoritative risk level and authorization requirements.
    """

    DESTRUCTIVE_PATTERNS = [
        re.compile(r"\brm\s+-rf\b", re.IGNORECASE),
        re.compile(r"\bdrop\s+(?:table|database)\b", re.IGNORECASE),
        re.compile(r"\bformat\s+[a-z]:", re.IGNORECASE),
        re.compile(r"\btruncate\s+table\b", re.IGNORECASE),
        re.compile(r"\bdel\s+/[fqs]\b", re.IGNORECASE),
        re.compile(r"\.git[\\/]", re.IGNORECASE),  # Direct mutation of .git metadata
        re.compile(r"\.env\b", re.IGNORECASE),     # Touching secret environment files
    ]

    SERVICE_PATTERNS = [
        re.compile(r"\bsystemctl\s+(?:restart|stop|reload)\b", re.IGNORECASE),
        re.compile(r"\bnet\s+(?:stop|start)\b", re.IGNORECASE),
        re.compile(r"\bpip\s+install\b", re.IGNORECASE),
        re.compile(r"\bnpm\s+install\b", re.IGNORECASE),
        re.compile(r"\bdocker\s+(?:stop|rm|restart)\b", re.IGNORECASE),
    ]

    def evaluate_risk(
        self,
        action_type: str,
        target_path: Optional[str] = None,
        command: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> RiskLevel:
        """
        Calculates authoritative risk level for an intended action.
        """
        full_text = f"{action_type} {target_path or ''} {command or ''} {parameters or ''}"

        # 1. Check for Level 3: Destructive operations
        for pattern in self.DESTRUCTIVE_PATTERNS:
            if pattern.search(full_text):
                return RiskLevel.L3_DESTRUCTIVE

        # 2. Check for Level 2: Service/Config changes
        for pattern in self.SERVICE_PATTERNS:
            if pattern.search(full_text):
                return RiskLevel.L2_SERVICE_CONFIG

        if action_type in ("config_mutation", "service_restart", "merge_to_main", "deploy_release"):
            return RiskLevel.L2_SERVICE_CONFIG

        # 3. Check for Level 1: Reversible edits in isolated branch
        if action_type in ("write_file", "patch_file", "run_test", "git_commit"):
            return RiskLevel.L1_REVERSIBLE

        # 4. Check for Level 0: Pure read/diagnosis
        if action_type in ("read_file", "list_files", "health_check", "ast_inspect", "metrics_query"):
            return RiskLevel.L0_READ_ONLY

        # Default conservative stance: unrecognized actions default to L2
        return RiskLevel.L2_SERVICE_CONFIG

    def requires_human_approval(self, risk_level: RiskLevel) -> bool:
        return risk_level >= RiskLevel.L2_SERVICE_CONFIG


# Global singleton instance
policy_engine = PolicyEngine()
