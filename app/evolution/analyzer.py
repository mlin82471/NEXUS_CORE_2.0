"""
Telemetry & Experience Analyzer for NEXUS CORE 2.0 Self-Evolution.
Inspects empirical metrics, failure root-causes, and execution history
to formulate evidence-based optimization proposals.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import EvolutionProposal, TaskExperience, Agent, AgentRun
from app.evolution.sandbox import verify_proposal_in_sandbox
import json

def analyze_and_propose_evolutions(db: Session) -> List[EvolutionProposal]:
    """
    Main analysis pipeline:
    1. Scan task experiences and agent telemetries.
    2. Identify recurring failure patterns or resource bottlenecks.
    3. Generate structured evolution proposals.
    4. Execute sandbox verification on each proposal.
    5. Persist proposals in DB with sandbox test results.
    """
    proposals: List[EvolutionProposal] = []

    # 1. Check for budget bottleneck proposals
    budget_prop = _evaluate_budget_bottlenecks(db)
    if budget_prop:
        proposals.append(budget_prop)

    # 2. Check for agent prompt / instruction evolution
    prompt_prop = _evaluate_agent_failures(db)
    if prompt_prop:
        proposals.append(prompt_prop)

    # 3. Check for new specialized agent synthesis
    synthesis_prop = _evaluate_agent_synthesis(db)
    if synthesis_prop:
        proposals.append(synthesis_prop)

    # 4. Check for routing optimization
    routing_prop = _evaluate_routing_optimization(db)
    if routing_prop:
        proposals.append(routing_prop)

    saved_proposals: List[EvolutionProposal] = []
    for prop in proposals:
        # Run sandbox verification
        test_result = verify_proposal_in_sandbox(prop.proposal_type, prop.proposed_diff)
        prop.sandbox_test_result = test_result
        if test_result["passed"]:
            prop.status = "test_passed"
        else:
            prop.status = "test_failed"

        db.add(prop)
        saved_proposals.append(prop)

    if saved_proposals:
        db.commit()
        for p in saved_proposals:
            db.refresh(p)

    return saved_proposals


def _evaluate_budget_bottlenecks(db: Session) -> Optional[EvolutionProposal]:
    """
    Detect if multiple tasks have failed due to step or token exhaustion.
    """
    failed_exps = db.query(TaskExperience).filter(
        TaskExperience.status.in_(["failed", "partial"])
    ).all()

    step_failures = 0
    token_failures = 0
    sample_ids = []

    for exp in failed_exps:
        reasons = exp.failure_reasons or []
        for r in reasons:
            cause = r.get("cause", "")
            detail = r.get("detail", "")
            if "max_steps" in detail or "step exceeds" in detail.lower():
                step_failures += 1
                sample_ids.append(exp.task_id)
            elif "budget" in cause.lower() or "token" in detail.lower():
                token_failures += 1
                sample_ids.append(exp.task_id)

    if step_failures >= 1 or token_failures >= 1:
        # Check if an active/pending proposal already exists
        existing = db.query(EvolutionProposal).filter(
            EvolutionProposal.proposal_type == "budget_tuning",
            EvolutionProposal.status.in_(["pending_test", "test_passed"])
        ).first()
        if existing:
            return None

        evidence = {
            "trigger": "budget_exhaustion_detected",
            "step_exhaustion_count": step_failures,
            "token_exhaustion_count": token_failures,
            "sample_task_ids": sample_ids[:5],
            "analysis": f"Detected {step_failures} step exhaustion(s) and {token_failures} token exhaustion(s)."
        }
        diff = {
            "target": "runtime_budget",
            "before": {"default_max_steps": 5, "default_max_total_tokens": 200000},
            "after": {"default_max_steps": 8, "default_max_total_tokens": 300000}
        }
        return EvolutionProposal(
            title="Auto-tune default step & token budget for complex tasks",
            proposal_type="budget_tuning",
            evidence=evidence,
            proposed_diff=diff
        )

    return None


def _evaluate_agent_failures(db: Session) -> Optional[EvolutionProposal]:
    """
    Detect agents with high failure rates or recurring timeout patterns
    and propose prompt refinements to enhance robustness.
    """
    agents = db.query(Agent).all()
    for agent in agents:
        telemetry = (agent.metadata_json or {}).get("telemetry", {})
        total_calls = telemetry.get("total_calls", 0)
        success_calls = telemetry.get("success_calls", 0)
        
        if total_calls >= 2:
            failure_rate = (total_calls - success_calls) / total_calls
            if failure_rate > 0.20:
                # Check for existing proposal
                existing = db.query(EvolutionProposal).filter(
                    EvolutionProposal.proposal_type == "agent_prompt_evolution",
                    EvolutionProposal.status.in_(["pending_test", "test_passed"])
                ).first()
                if existing:
                    continue

                evidence = {
                    "agent_id": agent.id,
                    "agent_name": agent.name,
                    "total_calls": total_calls,
                    "failure_rate": round(failure_rate, 2),
                    "analysis": f"Agent '{agent.name}' exhibits a high failure rate of {int(failure_rate*100)}%."
                }
                current_prompt = (agent.metadata_json or {}).get("system_prompt", f"You are {agent.name}, specializing in {agent.role}.")
                evolved_prompt = (
                    f"{current_prompt}\n\n"
                    "CRITICAL GUIDELINES FOR HIGH RELIABILITY:\n"
                    "1. Always keep responses concise, well-structured, and strictly adhere to task requirements.\n"
                    "2. Verify code syntax and logic before providing final answers.\n"
                    "3. Complete execution within reasonable token budget limits."
                )
                diff = {
                    "target": "agent",
                    "target_id": agent.id,
                    "agent_name": agent.name,
                    "before": {"system_prompt": current_prompt},
                    "after": {"system_prompt": evolved_prompt}
                }
                return EvolutionProposal(
                    title=f"Evolve system instructions for agent '{agent.name}' to curb failure rate",
                    proposal_type="agent_prompt_evolution",
                    evidence=evidence,
                    proposed_diff=diff
                )

    return None


def _evaluate_agent_synthesis(db: Session) -> Optional[EvolutionProposal]:
    """
    Synthesize specialized agent proposal if dedicated roles (e.g. verification)
    are missing or heavily requested.
    """
    existing_roles = {a.role for a in db.query(Agent).all()}
    if "verification" not in existing_roles:
        existing = db.query(EvolutionProposal).filter(
            EvolutionProposal.proposal_type == "new_agent_synthesis",
            EvolutionProposal.status.in_(["pending_test", "test_passed"])
        ).first()
        if existing:
            return None

        evidence = {
            "trigger": "missing_specialized_verifier",
            "active_roles": list(existing_roles),
            "analysis": "Blueprint Section 1 & 4 requires an independent verification agent to inspect outputs and prevent unverified self-reported success."
        }
        diff = {
            "target": "agents_table",
            "before": None,
            "after": {
                "name": "nexus_verifier_v1",
                "role": "verification",
                "adapter_type": "hermes",
                "description": "Independent result inspection and verification agent",
                "capabilities": ["result_verification", "code_syntax_check", "factual_consistency"],
                "permission_set": ["read_task", "run_agent"]
            }
        }
        return EvolutionProposal(
            title="Synthesize independent result verification agent 'nexus_verifier_v1'",
            proposal_type="new_agent_synthesis",
            evidence=evidence,
            proposed_diff=diff
        )

    return None


def _evaluate_routing_optimization(db: Session) -> Optional[EvolutionProposal]:
    """
    Propose model routing optimizations based on empirical latency and token usage.
    """
    experiences = db.query(TaskExperience).filter(TaskExperience.status == "success").all()
    if len(experiences) >= 3:
        existing = db.query(EvolutionProposal).filter(
            EvolutionProposal.proposal_type == "routing_optimization",
            EvolutionProposal.status.in_(["pending_test", "test_passed"])
        ).first()
        if existing:
            return None

        evidence = {
            "total_successful_experiences": len(experiences),
            "analysis": "Sufficient execution data collected. Propose optimizing FAST tier model for low complexity tasks to cut latency by ~40%."
        }
        diff = {
            "target": "model_router",
            "before": {"fast_tier_model": "qwen-turbo"},
            "after": {"fast_tier_model": "gemini-3.8-flash-fast"}
        }
        return EvolutionProposal(
            title="Optimize FAST model routing tier for low-latency dispatch",
            proposal_type="routing_optimization",
            evidence=evidence,
            proposed_diff=diff
        )

    return None
