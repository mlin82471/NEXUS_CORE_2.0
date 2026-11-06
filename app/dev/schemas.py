"""
NEXUS CORE 2.1 — NEXUS DEV Schemas & Data Contracts (§DEV-1).
Defines contracts for autonomous software engineering workflows.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class DevTaskStage(str, Enum):
    REQUIREMENT = "requirement"
    ARCHITECTURE = "architecture"
    WORKSPACE_READY = "workspace_ready"
    CODING = "coding"
    REVIEWING = "reviewing"
    TESTING = "testing"
    REPAIRING = "repairing"
    RELEASE_READY = "release_ready"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class DevRequirement:
    requirement_id: str
    title: str
    raw_user_prompt: str
    functional_specs: List[str]
    acceptance_criteria: List[str]
    target_language: str = "python"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class DevChangeSet:
    changeset_id: str
    workspace_id: str
    task_id: str
    modified_files: List[str]
    patch_diff: str
    commit_message: str
    author_agent_id: str
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class DevCodeReview:
    review_id: str
    changeset_id: str
    reviewer_agent_id: str
    quality_score: float     # 0.0 to 10.0
    passed: bool
    l1_structure_passed: bool
    l2_static_ast_passed: bool
    l3_dynamic_test_passed: bool
    l4_acceptance_passed: bool
    findings: List[str]
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class DevReleasePackage:
    release_id: str
    version: str
    project_name: str
    summary: str
    deliverables: List[str]
    changelog: List[str]
    evidence_fingerprints: List[str]
    delivered_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
