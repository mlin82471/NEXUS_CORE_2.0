"""
NEXUS CORE 2.0 — Benchmark Module
A/B Comparative Evaluation: Single-Agent vs Multi-Agent Orchestration (§7).
"""
from app.benchmark.comparator import (
    ABComparisonReport,
    ExecutionMetrics,
    run_ab_comparison,
)

__all__ = [
    "ABComparisonReport",
    "ExecutionMetrics",
    "run_ab_comparison",
]
