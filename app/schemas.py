"""Pydantic schemas for API I/O and plan validation."""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Literal

ROLES = {"research", "coding", "analysis", "knowledge", "execution", "verification"}
RoleType = Literal["research", "coding", "analysis", "knowledge", "execution", "verification"]
AdapterType = Literal["mock", "dsh", "hermes", "antigravity"]

# ---- Plan ----

class PlanStepSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_key: str = Field(min_length=1, max_length=20)
    title: str = Field(default="", max_length=100)
    goal: str = Field(min_length=1, max_length=5000)
    role: RoleType = "analysis"
    depends_on: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("step_key")
    @classmethod
    def key_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("step_key must not be blank")
        return trimmed

    @field_validator("goal")
    @classmethod
    def goal_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("goal must not be blank")
        return trimmed

    @field_validator("depends_on")
    @classmethod
    def deps_clean(cls, v: list[str]) -> list[str]:
        cleaned = []
        seen = set()
        for item in v:
            if not isinstance(item, str):
                raise ValueError(f"depends_on items must be strings, got {type(item)}")
            trimmed = item.strip()
            if not trimmed:
                raise ValueError("depends_on cannot contain blank items")
            if trimmed in seen:
                raise ValueError(f"duplicate dependency: {trimmed!r}")
            seen.add(trimmed)
            cleaned.append(trimmed)
        return cleaned


class PlanSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    steps: list[PlanStepSchema] = Field(min_length=1, max_length=10)

    @field_validator("steps")
    @classmethod
    def validate_dag(cls, steps: list[PlanStepSchema]) -> list[PlanStepSchema]:
        keys = {s.step_key for s in steps}
        if len(keys) != len(steps):
            raise ValueError("duplicate step_key in plan")
        for s in steps:
            for d in s.depends_on:
                if d == s.step_key:
                    raise ValueError(f"step {s.step_key} depends on itself")
                if d not in keys:
                    raise ValueError(f"step {s.step_key} depends on unknown key {d!r}")
        indeg = {s.step_key: len(s.depends_on) for s in steps}
        ready = [k for k, v in indeg.items() if v == 0]
        seen = 0
        while ready:
            k = ready.pop()
            seen += 1
            for s in steps:
                if k in s.depends_on:
                    indeg[s.step_key] -= 1
                    if indeg[s.step_key] == 0:
                        ready.append(s.step_key)
        if seen != len(steps):
            raise ValueError("plan contains a dependency cycle")
        return steps


# ---- API ----

class TaskCreate(BaseModel):
    goal: str = Field(min_length=2, max_length=10000)
    task_type: Literal["general", "research", "coding", "analysis", "knowledge"] = "general"
    risk_suggestion: Literal["low", "high"] = "low"  # server may override
    execution_mode: Literal["orchestrated", "single_agent"] = "orchestrated"
    idempotency_key: str | None = Field(default=None, max_length=128)
    allowed_permissions: list[str] | None = Field(default=None)

    @field_validator("goal")
    @classmethod
    def goal_trim(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("goal must not be blank")
        return trimmed


class AgentRegister(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    role: str = Field(min_length=2, max_length=40)
    adapter_type: AdapterType = "mock"
    description: str = ""

    @field_validator("name")
    @classmethod
    def name_trim(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("name must not be blank")
        return trimmed

    @field_validator("role")
    @classmethod
    def role_validate(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"Unknown role {v!r}. Must be one of {ROLES}")
        return v


# ---- M2 Schemas ----

class ClassifyRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=10000)
    task_type: Literal["general", "research", "coding", "analysis", "knowledge"] = "general"


class ABCompareRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=10000)
    task_type: Literal["general", "research", "coding", "analysis", "knowledge"] = "general"


# ---- M4 Schemas ----

ProposalType = Literal["budget_tuning", "routing_optimization", "agent_prompt_evolution", "new_agent_synthesis"]
ProposalStatus = Literal["pending_test", "test_passed", "test_failed", "approved", "rejected", "rolled_back"]

class ProposalCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=128)
    proposal_type: ProposalType
    evidence: dict = Field(default_factory=dict)
    proposed_diff: dict = Field(default_factory=dict)

class ProposalApprovalRequest(BaseModel):
    approval_token: str = Field(min_length=1)
    comment: str = Field(default="", max_length=500)

class ProposalRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


