"""
NEXUS CORE 2.0 — Router Module
M2 Intelligent Scheduling, Task Classification & Model Routing.
"""
from app.router.classifier import (
    TaskComplexity,
    TaskClassification,
    classify_task,
)
from app.router.model_router import (
    ModelTier,
    ModelRouteDecision,
    route_model,
)
from app.router.metrics import (
    record_agent_execution,
    get_agent_metrics,
)

__all__ = [
    "TaskComplexity",
    "TaskClassification",
    "classify_task",
    "ModelTier",
    "ModelRouteDecision",
    "route_model",
    "record_agent_execution",
    "get_agent_metrics",
]
