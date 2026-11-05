"""SQLAlchemy models for NEXUS CORE 2.0."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Boolean, ForeignKey,
    JSON, DateTime, Text, UniqueConstraint, Index, CheckConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base

VALID_STATUSES = {"queued", "running", "success", "partial", "failed", "cancelled"}
VALID_RISK = {"low", "high"}
VALID_ADAPTERS = {"mock", "dsh", "hermes", "antigravity"}

def _uid():
    return uuid.uuid4().hex[:12]

def _now():
    return datetime.now(timezone.utc)


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        CheckConstraint("adapter_type IN ('mock','dsh','hermes','antigravity','custom')", name="ck_agent_adapter"),
    )
    id                  = Column(String(12), primary_key=True, default=_uid)
    name                = Column(String(128), unique=True, nullable=False)
    role                = Column(String(64), nullable=False)
    adapter_type        = Column(String(32), nullable=False, default="mock")
    description         = Column(Text, default="")
    enabled             = Column(Boolean, default=True)
    verification_status = Column(String(32), default="declared")
    capabilities        = Column(JSON, default=list)
    permission_set      = Column(JSON, default=list)
    metadata_json       = Column(JSON, default=dict)
    created_at          = Column(DateTime, default=_now)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("status IN ('queued','running','success','partial','failed','cancelled')",
                         name="ck_task_status"),
        CheckConstraint("risk_level IN ('low','high')", name="ck_task_risk"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_created", "created_at"),
    )
    id                  = Column(String(12), primary_key=True, default=_uid)
    goal                = Column(Text, nullable=False)
    task_type           = Column(String(32), nullable=False, default="general")
    risk_level          = Column(String(8), nullable=False, default="low")
    status              = Column(String(16), nullable=False, default="queued")
    approval_status     = Column(String(16), default="none")
    replan_count        = Column(Integer, default=0)
    idempotency_key     = Column(String(128), unique=True, nullable=True)
    request_fingerprint = Column(String(64), nullable=True)
    max_total_tokens    = Column(Integer, default=200000)
    max_model_calls     = Column(Integer, default=20)
    max_steps           = Column(Integer, default=10)
    max_agents          = Column(Integer, default=5)
    max_parallel        = Column(Integer, default=3)
    allowed_permissions = Column(JSON, default=list)
    budget              = Column(JSON, default=dict)
    plan_json           = Column(JSON, default=list)
    plan_source         = Column(String(16), default="none")
    result              = Column(Text, default="")
    warnings            = Column(JSON, default=list)
    execution_round     = Column(Integer, default=0)
    complexity          = Column(String(16), default="simple")
    execution_mode      = Column(String(16), default="orchestrated")
    routing_decision    = Column(JSON, default=dict)
    created_at          = Column(DateTime, default=_now)
    started_at          = Column(DateTime, nullable=True)
    finished_at         = Column(DateTime, nullable=True)
    steps               = relationship("PlanStep", back_populates="task", lazy="selectin",
                                       order_by="PlanStep.step_order")
    events              = relationship("TaskEvent", back_populates="task", lazy="selectin",
                                       order_by="TaskEvent.created_at")


class PlanStep(Base):
    __tablename__ = "plan_steps"
    __table_args__ = (
        UniqueConstraint("task_id", "step_key", name="uq_plan_step_task_key"),
        Index("ix_planstep_task", "task_id"),
    )
    id                  = Column(String(12), primary_key=True, default=_uid)
    task_id             = Column(String(12), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    step_key            = Column(String(20), nullable=False)
    step_order          = Column(Integer, nullable=False, default=0)
    is_active           = Column(Integer, default=1)
    title               = Column(String(128), default="")
    goal                = Column(Text, nullable=False)
    role                = Column(String(64), nullable=False)
    required_permissions= Column(JSON, default=list)
    acceptance_criteria = Column(JSON, default=list)
    depends_on          = Column(JSON, default=list)
    status              = Column(String(16), default="pending")
    verification_status = Column(String(32), default="pending")
    result              = Column(Text, default="")
    error               = Column(Text, default="")
    attempts            = Column(Integer, default=0)
    task                = relationship("Task", back_populates="steps")
    agent_runs          = relationship("AgentRun", back_populates="step", lazy="selectin",
                                       order_by="AgentRun.started_at")


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("ix_agentrun_task", "task_id"),
        Index("ix_agentrun_step", "step_id"),
    )
    id              = Column(String(12), primary_key=True, default=_uid)
    task_id         = Column(String(12), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    step_id         = Column(String(12), ForeignKey("plan_steps.id", ondelete="CASCADE"), nullable=False)
    agent_id        = Column(String(12), ForeignKey("agents.id", ondelete="RESTRICT"), nullable=False)
    status          = Column(String(16), default="pending")
    input_tokens    = Column(Integer, default=0)
    output_tokens   = Column(Integer, default=0)
    started_at      = Column(DateTime, default=_now)
    finished_at     = Column(DateTime, nullable=True)
    step            = relationship("PlanStep", back_populates="agent_runs")


class TaskEvent(Base):
    __tablename__ = "task_events"
    __table_args__ = (
        Index("ix_event_task", "task_id"),
    )
    id              = Column(Integer, primary_key=True, autoincrement=True)
    task_id         = Column(String(12), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    event_type      = Column(String(32), nullable=False)
    message         = Column(Text, default="")
    payload         = Column(JSON, default=dict)
    created_at      = Column(DateTime, default=_now)
    task            = relationship("Task", back_populates="events")


# ===== M3 Models: Long-term Memory & Continuous Learning =====

class TaskExperience(Base):
    """
    Long-term experiential memory capturing execution blueprints,
    failure root-causes, and optimization lessons.
    """
    __tablename__ = "task_experiences"
    __table_args__ = (
        Index("ix_experience_task", "task_id"),
        Index("ix_experience_type", "task_type"),
        Index("ix_experience_status", "status"),
    )
    id               = Column(String(12), primary_key=True, default=_uid)
    task_id          = Column(String(12), nullable=False)
    goal             = Column(Text, nullable=False)
    task_type        = Column(String(32), default="general")
    complexity       = Column(String(16), default="simple")
    status           = Column(String(16), nullable=False)
    plan_summary     = Column(JSON, default=list)
    lessons_learned  = Column(Text, default="")
    failure_reasons  = Column(JSON, default=list)
    token_cost       = Column(Integer, default=0)
    execution_time_s = Column(Integer, default=0)
    created_at       = Column(DateTime, default=_now)


class KnowledgeItem(Base):
    """
    Structured domain knowledge snippets, code templates,
    and guidelines accumulated over time.
    """
    __tablename__ = "knowledge_items"
    __table_args__ = (
        Index("ix_knowledge_key", "key"),
        Index("ix_knowledge_category", "category"),
    )
    id              = Column(String(12), primary_key=True, default=_uid)
    key             = Column(String(128), unique=True, nullable=False)
    category        = Column(String(32), default="general")
    content         = Column(Text, nullable=False)
    tags            = Column(JSON, default=list)
    source_task_id  = Column(String(12), nullable=True)
    usage_count     = Column(Integer, default=0)
    created_at      = Column(DateTime, default=_now)


# ===== M4 Models: Controlled Self-Evolution =====

class EvolutionProposal(Base):
    """
    Structured self-evolution proposal for parameter tuning,
    routing optimization, prompt iteration, or new agent synthesis.
    Must pass sandbox testing before human approval can be granted.
    """
    __tablename__ = "evolution_proposals"
    __table_args__ = (
        Index("ix_proposal_status", "status"),
        Index("ix_proposal_type", "proposal_type"),
        CheckConstraint(
            "proposal_type IN ('budget_tuning','routing_optimization','agent_prompt_evolution','new_agent_synthesis')",
            name="ck_proposal_type"
        ),
        CheckConstraint(
            "status IN ('pending_test','test_passed','test_failed','approved','rejected','rolled_back')",
            name="ck_proposal_status"
        ),
    )
    id                  = Column(String(12), primary_key=True, default=_uid)
    title               = Column(String(128), nullable=False)
    proposal_type       = Column(String(32), nullable=False)
    status              = Column(String(24), nullable=False, default="pending_test")
    evidence            = Column(JSON, default=dict)
    proposed_diff       = Column(JSON, default=dict)
    sandbox_test_result = Column(JSON, default=dict)
    approval_token      = Column(String(64), nullable=True)
    rejection_reason    = Column(Text, nullable=True)
    applied_at          = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=_now)


