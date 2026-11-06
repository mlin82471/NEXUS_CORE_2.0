"""
Proposal Lifecycle & Deployment Manager for NEXUS CORE 2.0 Self-Evolution.
Enforces human-in-the-loop approval, security token validation,
atomic deployment, and safe rollbacks.
"""
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.models import EvolutionProposal, Agent, TaskEvent
from app.config import settings

class EvolutionApprovalError(Exception):
    """Raised when proposal approval fails validation or authorization."""
    pass

class EvolutionRollbackError(Exception):
    """Raised when proposal rollback cannot be completed."""
    pass


def approve_and_apply(
    db: Session,
    proposal_id: str,
    approval_token: str,
    comment: str = ""
) -> EvolutionProposal:
    """
    Validate approval authorization and apply proposal changes atomically.
    Strict prerequisite: proposal must have status == 'test_passed'.
    """
    proposal = db.query(EvolutionProposal).filter(EvolutionProposal.id == proposal_id).first()
    if not proposal:
        raise EvolutionApprovalError(f"Proposal '{proposal_id}' not found")

    if proposal.status != "test_passed":
        raise EvolutionApprovalError(
            f"Cannot approve proposal with status '{proposal.status}'. "
            "Proposal must first pass sandbox testing ('test_passed')."
        )

    # Validate approval token
    if settings.approval_token:
        if approval_token != settings.approval_token:
            raise EvolutionApprovalError("Invalid approval token provided")
    else:
        # In dev or unconfigured token mode, require a non-empty token
        if not approval_token or len(approval_token.strip()) < 3:
            raise EvolutionApprovalError("Approval token must be provided")

    diff = proposal.proposed_diff or {}
    after = diff.get("after", {})
    before = diff.get("before", {})

    # Apply mutation based on proposal type
    if proposal.proposal_type == "new_agent_synthesis":
        existing = db.query(Agent).filter(Agent.name == after.get("name")).first()
        if existing:
            # Re-enable if exists but disabled
            existing.enabled = True
            diff["created_agent_id"] = existing.id
        else:
            new_agent = Agent(
                name=after["name"],
                role=after["role"],
                adapter_type=after.get("adapter_type", "mock"),
                description=after.get("description", ""),
                capabilities=after.get("capabilities", []),
                permission_set=after.get("permission_set", []),
                verification_status="verified",
                metadata_json={
                    "synthesized_by_proposal": proposal.id,
                    "synthesized_at": datetime.now(timezone.utc).isoformat()
                }
            )
            db.add(new_agent)
            db.flush()
            diff["created_agent_id"] = new_agent.id
            flag_modified(proposal, "proposed_diff")

    elif proposal.proposal_type == "agent_prompt_evolution":
        target_id = diff.get("target_id")
        agent = db.query(Agent).filter(Agent.id == target_id).first() if target_id else None
        if not agent and diff.get("agent_name"):
            agent = db.query(Agent).filter(Agent.name == diff.get("agent_name")).first()

        if not agent:
            raise EvolutionApprovalError(f"Target agent for prompt evolution not found")

        meta = dict(agent.metadata_json or {})
        meta["system_prompt"] = after.get("system_prompt", "")
        meta["prompt_version"] = meta.get("prompt_version", 1) + 1
        agent.metadata_json = meta
        flag_modified(agent, "metadata_json")

    elif proposal.proposal_type == "budget_tuning":
        # Apply runtime budget tuning
        after = diff.get("after", {})
        if "default_max_total_tokens" in after:
            settings.default_token_budget = int(after["default_max_total_tokens"])
        if "default_max_steps" in after:
            settings.default_max_subtasks = int(after["default_max_steps"])
        diff["applied_tuning"] = after
        flag_modified(proposal, "proposed_diff")

    elif proposal.proposal_type == "routing_optimization":
        # Apply routing model optimization
        after = diff.get("after", {})
        if "preferred_model" in after:
            settings.planner_model = str(after["preferred_model"])
        diff["applied_routing"] = after
        flag_modified(proposal, "proposed_diff")

    # Mark proposal as approved
    proposal.status = "approved"
    proposal.approval_token = approval_token
    proposal.applied_at = datetime.now(timezone.utc)
    if comment:
        evidence = dict(proposal.evidence or {})
        evidence["approval_comment"] = comment
        proposal.evidence = evidence
        flag_modified(proposal, "evidence")

    db.commit()
    db.refresh(proposal)
    return proposal


def reject_proposal(db: Session, proposal_id: str, reason: str) -> EvolutionProposal:
    """
    Reject an evolution proposal with user-supplied justification.
    """
    proposal = db.query(EvolutionProposal).filter(EvolutionProposal.id == proposal_id).first()
    if not proposal:
        raise EvolutionApprovalError(f"Proposal '{proposal_id}' not found")

    if proposal.status in ("approved", "rolled_back"):
        raise EvolutionApprovalError(f"Cannot reject proposal that has already been {proposal.status}")

    proposal.status = "rejected"
    proposal.rejection_reason = reason
    db.commit()
    db.refresh(proposal)
    return proposal


def rollback_proposal(db: Session, proposal_id: str) -> EvolutionProposal:
    """
    Revert the changes introduced by an approved evolution proposal.
    """
    proposal = db.query(EvolutionProposal).filter(EvolutionProposal.id == proposal_id).first()
    if not proposal:
        raise EvolutionRollbackError(f"Proposal '{proposal_id}' not found")

    if proposal.status != "approved":
        raise EvolutionRollbackError(f"Only approved proposals can be rolled back (current: {proposal.status})")

    diff = proposal.proposed_diff or {}
    before = diff.get("before")

    if proposal.proposal_type == "new_agent_synthesis":
        created_id = diff.get("created_agent_id")
        agent_name = diff.get("after", {}).get("name")
        agent = None
        if created_id:
            agent = db.query(Agent).filter(Agent.id == created_id).first()
        if not agent and agent_name:
            agent = db.query(Agent).filter(Agent.name == agent_name).first()

        if agent:
            agent.enabled = False
            flag_modified(agent, "enabled")

    elif proposal.proposal_type == "agent_prompt_evolution":
        target_id = diff.get("target_id")
        agent = db.query(Agent).filter(Agent.id == target_id).first() if target_id else None
        if not agent and diff.get("agent_name"):
            agent = db.query(Agent).filter(Agent.name == diff.get("agent_name")).first()

        if agent and before:
            meta = dict(agent.metadata_json or {})
            meta["system_prompt"] = before.get("system_prompt", "")
            meta["prompt_version"] = max(1, meta.get("prompt_version", 2) - 1)
            agent.metadata_json = meta
            flag_modified(agent, "metadata_json")

    elif proposal.proposal_type == "budget_tuning" and before:
        if "default_max_total_tokens" in before:
            settings.default_token_budget = int(before["default_max_total_tokens"])
        if "default_max_steps" in before:
            settings.default_max_subtasks = int(before["default_max_steps"])

    elif proposal.proposal_type == "routing_optimization" and before:
        if "preferred_model" in before:
            settings.planner_model = str(before["preferred_model"])

    proposal.status = "rolled_back"
    db.commit()
    db.refresh(proposal)
    return proposal
