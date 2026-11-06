"""
NEXUS CORE 2.1 — Model Arena & Benchmark API Endpoints.
Prefix: /api/benchmark
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.benchmark.arena import (
    ModelArenaEngine,
    ModelArenaReport,
    model_arena_engine,
)

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


class RunArenaRequest(BaseModel):
    goal: str = Field(..., min_length=2, description="Task prompt to execute across candidate models")
    candidate_models: List[str] = Field(default_factory=lambda: ["deepseek-chat", "deepseek-reasoner", "qwen-plus"])
    task_type: str = "coding"


@router.post("/arena", response_model=ModelArenaReport)
def run_model_arena(req: RunArenaRequest):
    """
    Executes a side-by-side empirical performance arena across candidate models.
    """
    try:
        return model_arena_engine.run_arena(
            goal=req.goal,
            candidate_models=req.candidate_models,
            task_type=req.task_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/arena/history", response_model=List[ModelArenaReport])
def get_arena_history(limit: int = 10):
    """List historical model arena matches."""
    return model_arena_engine.list_history(limit=limit)


@router.get("/arena/rankings")
def get_empirical_rankings():
    """Get aggregated empirical data-driven rankings by model."""
    return model_arena_engine.get_empirical_rankings()
