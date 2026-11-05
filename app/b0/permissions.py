"""
NEXUS CORE 2.0 — B0 Permission Protocol (§2.3, §4)
"""
from typing import Sequence

ROLES = {"analysis", "coding", "verification", "execution", "knowledge", "research"}

ROLE_TO_PERMISSIONS: dict[str, list[str]] = {
    "analysis": ["read_data", "reason"],
    "coding": ["read_files", "write_files", "execute_code"],
    "verification": ["read_data", "validate"],
    "execution": ["execute_code", "write_files"],
    "knowledge": ["read_data", "search"],
    "research": ["read_data", "search", "reason"],
}

def get_required_permissions_for_role(role: str) -> list[str]:
    """Return required permissions for a role per §2.3.
    Raises ValueError if role is not recognized.
    """
    if role not in ROLE_TO_PERMISSIONS:
        raise ValueError(f"Unknown role {role!r}. Must be one of {sorted(ROLES)}")
    return list(ROLE_TO_PERMISSIONS[role])

def check_permissions(
    agent_permission_set: Sequence[str] | None,
    required_permissions: Sequence[str] | None,
    task_allowed_permissions: Sequence[str] | None,
) -> tuple[bool, str | None]:
    """Authoritative permission check per §4.2, §4.3, §4.6.
    
    Default-Deny Rules:
    1. agent_permission_set must not be null/empty.
    2. task_allowed_permissions must not be null/empty.
    3. agent_permission_set must be a superset of required_permissions (agent has all needed capabilities).
    4. agent_permission_set must NOT contain permissions outside task_allowed_permissions (no excess permissions).
    
    Returns (True, None) if authorized, or (False, reason) if denied.
    """
    if not agent_permission_set:
        return False, "DENY: agent.permission_set is empty or not declared"
    
    if not task_allowed_permissions:
        return False, "DENY: task.allowed_permissions is empty or not specified"
    
    agent_set = set(agent_permission_set)
    required_set = set(required_permissions or [])
    allowed_set = set(task_allowed_permissions)
    
    # Check 1: Agent must have all required permissions
    missing = required_set - agent_set
    if missing:
        return False, f"DENY: agent lacks required permissions: {sorted(missing)}"
    
    # Check 2: Agent must NOT possess any permission outside task.allowed_permissions
    excess = agent_set - allowed_set
    if excess:
        return False, f"DENY: agent has permissions not allowed by task: {sorted(excess)}"
    
    return True, None
