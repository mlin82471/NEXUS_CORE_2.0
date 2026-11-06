"""
NEXUS CORE 2.1 — Model Hub Smart Router (§MODEL-ROUTER).
Implements 3-tier routing:
1. MANUAL: strictly respects explicit user/task model choice;
2. AUTO_COMPLEXITY: routes low/medium/high/coding tasks to matched tiers;
3. COST_OPTIMIZED: selects the lowest-cost capable model satisfying quality gates.
"""

from typing import Dict, Optional, Tuple
from app.model_hub.schemas import ModelConfig, RoutingMode, RoutingPolicy


class ModelHubRouter:
    """
    Intelligent routing engine dynamically binding tasks to optimal models.
    """

    def __init__(self):
        self._policy = RoutingPolicy(
            mode=RoutingMode.AUTO_COMPLEXITY,
            manual_model_id="deepseek-chat",
            cost_threshold_usd_per_m=1.0,
            fallback_model_id="qwen-plus",
            audit_reason="System initialized default routing policy",
        )

    def get_policy(self) -> RoutingPolicy:
        return self._policy

    def set_policy(self, policy: RoutingPolicy) -> RoutingPolicy:
        self._policy = policy
        return self._policy

    def route_model(
        self,
        task_type: str = "coding",
        complexity: str = "medium",
        user_explicit_model: Optional[str] = None,
        available_models: Optional[Dict[str, ModelConfig]] = None,
    ) -> Tuple[str, str]:
        """
        Determines the optimal model_id and audit trail justification.
        Returns: (model_id, routing_reason)
        """
        # Mode 1: User explicit override or MANUAL mode
        if user_explicit_model:
            return user_explicit_model, f"Explicit user selection: {user_explicit_model}"

        if self._policy.mode == RoutingMode.MANUAL:
            target = self._policy.manual_model_id or "deepseek-chat"
            return target, f"Manual routing policy mode: {target}"

        # Mode 2: COST_OPTIMIZED Mode
        if self._policy.mode == RoutingMode.COST_OPTIMIZED:
            # Find cheapest enabled model under cost threshold
            if available_models:
                candidates = [
                    m for m in available_models.values()
                    if m.enabled and (m.pricing.input_price_per_m + m.pricing.output_price_per_m) <= self._policy.cost_threshold_usd_per_m
                ]
                if candidates:
                    candidates.sort(key=lambda m: m.pricing.input_price_per_m + m.pricing.output_price_per_m)
                    cheapest = candidates[0]
                    return cheapest.model_id, f"Cost-optimized tier: ${cheapest.pricing.input_price_per_m}/M in, ${cheapest.pricing.output_price_per_m}/M out"

            return "deepseek-chat", "Cost-optimized default fallback: deepseek-chat ($0.14/M)"

        # Mode 3: AUTO_COMPLEXITY Mode (Default)
        if task_type in ("coding", "execution"):
            if complexity == "high":
                return "deepseek-reasoner", "Auto-Complexity: high-complexity coding routed to DeepSeek-R1 reasoner"
            return "deepseek-chat", "Auto-Complexity: standard coding routed to DeepSeek-V3"

        if task_type in ("analysis", "verification"):
            if complexity == "high":
                return "deepseek-reasoner", "Auto-Complexity: deep RCA analysis routed to Reasoner"
            return "qwen-max", "Auto-Complexity: structured analysis routed to Qwen-Max"

        if task_type in ("research", "knowledge"):
            return "gemini-2.0-flash", "Auto-Complexity: broad knowledge search routed to Gemini-Flash"

        # General fallback
        return "deepseek-chat", "Auto-Complexity: general task routed to default balanced model"


model_router = ModelHubRouter()
