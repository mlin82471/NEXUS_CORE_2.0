"""
NEXUS CORE 2.0 — Dynamic Model Router (§3 & §M2)
Routes tasks to optimal models based on:
- Complexity (simple vs single_expert vs complex)
- Role specialty (coding vs analysis vs reasoning)
- Cost & Token Budget headroom
- Latency preference
"""
import os
from enum import Enum
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from app.config import settings
from app.router.classifier import TaskComplexity


class ModelTier(str, Enum):
    FAST = "fast"          # Low latency, minimal token cost (Flash / Turbo)
    BALANCED = "balanced"  # Standard high-reliability (Plus / Medium)
    CODER = "coder"        # Specialized code generation (Antigravity engine)
    REASONING = "reasoning"# Complex multi-step architecture / formal proof


class ModelRouteDecision(BaseModel):
    model_name: str
    model_tier: ModelTier
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_cost_ratio: float = 1.0  # Normalized cost relative to fast tier (1.0 = base)
    reason: str
    recommended_adapter: str = "mock"


def route_model(
    goal: str,
    complexity: TaskComplexity,
    role: str = "coding",
    remaining_budget_tokens: Optional[int] = None,
) -> ModelRouteDecision:
    """
    Selects the most cost-effective and capable model configuration.
    """
    token_len = len(goal) // 2
    est_in = max(50, token_len)
    
    # 1. Budget Emergency Fallback: If remaining tokens < 5000, force FAST tier
    if remaining_budget_tokens is not None and remaining_budget_tokens < 5000:
        model = os.getenv("PLANNER_MODEL", "gemini-3.8-flash-medium")
        return ModelRouteDecision(
            model_name=model,
            model_tier=ModelTier.FAST,
            estimated_input_tokens=est_in,
            estimated_output_tokens=max(50, est_in // 2),
            estimated_cost_ratio=0.5,
            reason="Budget conservation: Remaining token headroom is critically low (<5k tokens).",
            recommended_adapter="antigravity" if role == "coding" and settings.enable_antigravity_adapter else "hermes",
        )

    # 2. Simple tasks: Always route to FAST tier
    if complexity == TaskComplexity.SIMPLE:
        model = os.getenv("PLANNER_MODEL", "gemini-3.8-flash-medium")
        return ModelRouteDecision(
            model_name=model,
            model_tier=ModelTier.FAST,
            estimated_input_tokens=est_in,
            estimated_output_tokens=max(30, est_in // 2),
            estimated_cost_ratio=1.0,
            reason="Simple task: Low latency fast model sufficient to prevent unnecessary token consumption.",
            recommended_adapter="hermes" if settings.enable_hermes_adapter else "mock",
        )

    # 3. Single Expert Coding: Route to CODER tier
    if role == "coding":
        model = os.getenv("ANTIGRAVITY_MODEL") or os.getenv("PLANNER_MODEL", "gemini-3.8-flash-medium")
        return ModelRouteDecision(
            model_name=model,
            model_tier=ModelTier.CODER,
            estimated_input_tokens=est_in,
            estimated_output_tokens=max(200, est_in * 2),
            estimated_cost_ratio=1.5,
            reason="Coding role: Specialized engineering model selected with code analysis capabilities.",
            recommended_adapter="antigravity" if settings.enable_antigravity_adapter else "hermes",
        )

    # 4. System Ops / Cluster Dispatch: Route to DSH
    if role in ("execution", "analysis") and any(w in goal.lower() for w in ["cluster", "集群", "系统", "运维", "端口", "top", "cpu"]):
        model = os.getenv("DSH_MODEL") or os.getenv("PLANNER_MODEL", "gemini-3.8-flash-medium")
        return ModelRouteDecision(
            model_name=model,
            model_tier=ModelTier.BALANCED,
            estimated_input_tokens=est_in,
            estimated_output_tokens=max(150, est_in),
            estimated_cost_ratio=1.2,
            reason="System operations role: Routed to DSH cluster adapter for environment inspection.",
            recommended_adapter="dsh" if settings.enable_dsh_adapter else "hermes",
        )

    # 5. Complex Tasks: Route to REASONING tier
    if complexity == TaskComplexity.COMPLEX:
        model = os.getenv("PLANNER_MODEL", "gemini-3.8-flash-medium")
        return ModelRouteDecision(
            model_name=model,
            model_tier=ModelTier.REASONING,
            estimated_input_tokens=est_in,
            estimated_output_tokens=max(300, est_in * 3),
            estimated_cost_ratio=2.5,
            reason="Complex multi-step task: High-tier reasoning model for DAG planning and multi-perspective synthesis.",
            recommended_adapter="hermes" if settings.enable_hermes_adapter else "mock",
        )

    # 6. Default Balanced
    model = os.getenv("PLANNER_MODEL", "gemini-3.8-flash-medium")
    return ModelRouteDecision(
        model_name=model,
        model_tier=ModelTier.BALANCED,
        estimated_input_tokens=est_in,
        estimated_output_tokens=max(100, est_in),
        estimated_cost_ratio=1.2,
        reason="Balanced tier for standard analytical tasks.",
        recommended_adapter="hermes" if settings.enable_hermes_adapter else "mock",
    )
