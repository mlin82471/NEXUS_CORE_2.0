"""
NEXUS CORE 2.1 — Agent Management Schemas (§AGENT-SCHEMAS).
Provides Pydantic models for Agent configuration, 5-step wizard creation,
permission boundaries, templates, and runtime telemetry.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    PLANNER = "planner"
    CODING = "coding"
    ANALYSIS = "analysis"
    RESEARCH = "research"
    KNOWLEDGE = "knowledge"
    EXECUTION = "execution"
    VERIFICATION = "verification"
    SRE_OPS = "sre_ops"
    CUSTOM = "custom"


class PermissionLevel(str, Enum):
    STRICT = "strict"              # Read-only sandbox, no side-effects without approval
    SUPERVISED = "supervised"      # Normal execution, high-risk actions require human token approval
    AUTONOMOUS = "autonomous"      # Fully autonomous execution within pre-granted budget & permissions


class AgentStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    PROVISIONAL = "provisional"


class AgentTemplate(BaseModel):
    template_id: str
    name: str
    role: AgentRole
    display_title: str
    description: str
    recommended_model: str
    default_budget_tokens: int = 25000
    default_permission_level: PermissionLevel = PermissionLevel.SUPERVISED
    recommended_tools: List[str] = Field(default_factory=list)
    system_prompt_preview: str = ""


class AgentCreateWizardRequest(BaseModel):
    # Step 1: Identity
    name: str = Field(..., min_length=2, max_length=64, description="Custom Agent display name")
    agent_id: Optional[str] = Field(None, description="Unique slug ID (auto-generated if omitted)")
    
    # Step 2: Role & Template
    role: AgentRole = Field(..., description="Agent primary professional role")
    template_id: Optional[str] = None
    description: str = ""
    
    # Step 3: Model Allocation
    primary_model_id: str = Field(default="deepseek-chat", description="Primary inference model")
    fallback_model_id: Optional[str] = Field(default="qwen-plus", description="Automatic fallback model")
    
    # Step 4: Budget & SLA
    budget_tokens_per_task: int = Field(default=30000, ge=1000, le=200000)
    max_retries: int = Field(default=1, ge=0, le=3)
    timeout_seconds: int = Field(default=60, ge=5, le=300)
    
    # Step 5: Permission & Autonomy
    permission_level: PermissionLevel = Field(default=PermissionLevel.SUPERVISED)
    allowed_tools: List[str] = Field(default_factory=lambda: ["read_data", "reason"])
    
    # Expert Mode overrides (optional)
    system_prompt: Optional[str] = None
    adapter_type: str = "custom"
    tags: List[str] = Field(default_factory=list)


class AgentConfig(BaseModel):
    agent_id: str
    name: str
    role: AgentRole
    adapter_type: str = "custom"
    description: str = ""
    status: AgentStatus = AgentStatus.ACTIVE
    
    # Models
    primary_model_id: str = "deepseek-chat"
    fallback_model_id: Optional[str] = "qwen-plus"
    
    # Governance & Budget
    budget_tokens_per_task: int = 30000
    max_retries: int = 1
    timeout_seconds: int = 60
    permission_level: PermissionLevel = PermissionLevel.SUPERVISED
    allowed_tools: List[str] = Field(default_factory=list)
    
    # Prompts & Metadata
    system_prompt: str = ""
    tags: List[str] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


class AgentDetailResponse(AgentConfig):
    # Runtime Telemetry
    total_tokens_consumed: int = 0
    total_tasks_completed: int = 0
    success_rate: float = 1.0
    verification_pass_rate: float = 1.0
    average_latency_ms: float = 0.0
    last_active_at: Optional[str] = None


class AgentTestRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Test input for the agent")
    model_override: Optional[str] = None


class AgentTestResponse(BaseModel):
    ok: bool
    agent_id: str
    model_used: str
    output: str
    tokens_used: int
    latency_ms: float
    verification_passed: bool
    error: Optional[str] = None
