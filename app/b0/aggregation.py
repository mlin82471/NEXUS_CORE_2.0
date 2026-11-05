"""
NEXUS CORE 2.0 — B0 Task Aggregation Engine (§1.1, §1.4)
Authoritative implementation of the 16-row decision table.
"""
from typing import Any, Mapping, Sequence

NON_TERMINAL_SUBTASK_STATUSES = {"pending", "running", "retrying", "blocked"}

def aggregate_task_status(
    active_subtasks: Sequence[Mapping[str, Any]],
    verifier_result: str | None = None,
    can_replan: bool = False,
    replan_count: int = 0,
    max_replans: int = 2,
) -> tuple[str, bool]:
    """Aggregate active SubTasks into Task terminal state per §1.4.
    
    Parameters:
      active_subtasks: Sequence of dict-like objects representing active (is_active=1) subtasks.
                       Each must have 'status' and 'verification_status'.
      verifier_result: 'PASSED', 'FAILED', 'INCONCLUSIVE', or None.
      can_replan: whether the task allows replanning.
      replan_count: current replan cycles performed.
      max_replans: maximum allowed replan cycles.
      
    Returns:
      (final_status, is_replan_triggered)
      final_status: 'success', 'partial', 'failed', 'cancelled', 'replan', or 'non_terminal'
    """
    # Filter only active subtasks if 'is_active' is present in items
    subtasks = [s for s in active_subtasks if s.get("is_active", 1) == 1]
    
    # Row 16: 0 active SubTasks (all SUPERSEDED or empty) -> failed
    if not subtasks:
        return "failed", False
    
    # Rows 14 & 15: Check for any transient or unresolved subtasks
    statuses = [str(s.get("status", "")).lower() for s in subtasks]
    if any(st in NON_TERMINAL_SUBTASK_STATUSES for st in statuses):
        return "non_terminal", False
    
    # Extract verification statuses (defaulting to 'pending' if missing)
    verifications = [str(s.get("verification_status", "")).lower() for s in subtasks]
    
    passed_count = sum(1 for v in verifications if v == "passed")
    failed_count = sum(1 for st, v in zip(statuses, verifications) if st == "failed" or v == "failed")
    skipped_count = sum(1 for st in statuses if st == "skipped")
    cancelled_count = sum(1 for st in statuses if st == "cancelled")
    inconclusive_count = sum(1 for v in verifications if v == "inconclusive")
    
    total = len(subtasks)
    replan_eligible = can_replan and (replan_count < max_replans)
    
    # Check Row 7: All CANCELLED
    if cancelled_count == total:
        return "cancelled", False
    
    # Check Rows 1, 2, 3: All PASSED
    if passed_count == total:
        # Task verifier runs after all active subtasks complete
        v_res = str(verifier_result).upper() if verifier_result else "PASSED"
        if v_res == "PASSED":
            return "success", False   # Row 1
        elif v_res == "FAILED":
            return "partial", False   # Row 2
        else: # INCONCLUSIVE or other
            return "partial", False   # Row 3
            
    # Check Rows 4 & 5: All FAILED
    if failed_count == total:
        if replan_eligible:
            return "replan", True     # Row 5
        return "failed", False        # Row 4
        
    # Check Row 6: All SKIPPED
    if skipped_count == total:
        return "failed", False        # Row 6
        
    # Check Rows 8 & 9: All INCONCLUSIVE
    if inconclusive_count == total:
        if replan_eligible:
            return "replan", True     # Row 9
        return "partial", False       # Row 8: NOT failed per v7 §1.1/§1.4!
        
    # Check Rows 10, 11, 12, 13: >= 1 PASSED with mix of other states
    if passed_count >= 1:
        return "partial", False       # Rows 10, 11, 12, 13
        
    # Zero PASSED with mixed non-passed states (e.g. FAILED + SKIPPED, or INCONCLUSIVE + FAILED)
    if inconclusive_count > 0 and replan_eligible:
        return "replan", True
        
    if inconclusive_count > 0:
        # Has inconclusive results, not a pure hard failure
        return "partial", False
        
    return "failed", False
