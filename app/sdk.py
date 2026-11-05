"""
NEXUS CORE 2.0 — Developer SDK & Agent Integration Toolkit.
Provides high-ergonomic, declarative decorators and base classes for plugging
custom agents, tools, and specialized models in 3 lines of code.
"""
from typing import Callable, Any, Optional, List, Dict
import functools
import json

from app.agents.base import AgentResult, AgentCancelledError
from app.models import Agent
from app.schemas import ROLES


class NexusAgent:
    """Base class for custom object-oriented NEXUS Agents."""
    name: str = "CustomAgent"
    role: str = "analysis"
    description: str = "Custom user-defined agent"
    capabilities: List[str] = ["read_data"]
    permission_set: List[str] = ["read_data"]

    def execute(self, goal: str, cancel_event=None) -> Any:
        raise NotImplementedError("Subclasses must implement execute(goal, cancel_event)")

    def run(self, goal: str, cancel_event=None) -> AgentResult:
        """Standard NEXUS adapter runtime contract."""
        if cancel_event and cancel_event.is_set():
            return AgentResult("[CANCELLED] Task cancelled before execution", 0, 0, "cancelled")

        output = self.execute(goal, cancel_event)
        if isinstance(output, AgentResult):
            return output

        text_res = output if isinstance(output, str) else json.dumps(output, ensure_ascii=False, indent=2)
        in_tokens = max(1, len(goal) // 4)
        out_tokens = max(1, len(text_res) // 4)
        return AgentResult(result=text_res, input_tokens=in_tokens, output_tokens=out_tokens, usage_source="estimated")


class FunctionAgentAdapter(NexusAgent):
    """Wraps a standard Python callable into a NEXUS-compliant agent."""
    def __init__(self, fn: Callable, name: str, role: str, description: str,
                 capabilities: Optional[List[str]] = None,
                 permission_set: Optional[List[str]] = None):
        self.fn = fn
        self.name = name
        self.role = role
        self.description = description
        self.capabilities = capabilities or ["read_data"]
        self.permission_set = permission_set or ["read_data"]

    def execute(self, goal: str, cancel_event=None) -> Any:
        try:
            return self.fn(goal, cancel_event=cancel_event)
        except TypeError:
            return self.fn(goal)


def sync_agent_record(db, name: str, role: str, description: str,
                      capabilities: List[str], permission_set: List[str]):
    """Idempotently syncs an agent record into the database session."""
    meta = {
        "capabilities": capabilities,
        "permission_set": permission_set,
        "is_custom_sdk": True
    }
    existing = db.query(Agent).filter(Agent.name == name).first()
    if not existing:
        agent = Agent(
            name=name,
            role=role,
            adapter_type="custom",
            description=description,
            verification_status="verified",
            enabled=True,
            capabilities=capabilities,
            permission_set=permission_set,
            metadata_json=meta
        )
        db.add(agent)
        db.commit()
    else:
        existing.role = role
        existing.adapter_type = "custom"
        existing.enabled = True
        existing.description = description
        existing.capabilities = capabilities
        existing.permission_set = permission_set
        existing.metadata_json = meta
        db.commit()


def register_custom_agent(agent_or_fn: Any, name: Optional[str] = None, role: Optional[str] = None,
                          description: Optional[str] = None,
                          capabilities: Optional[List[str]] = None,
                          permission_set: Optional[List[str]] = None,
                          db: Optional[Any] = None) -> Any:
    """
    Registers a custom agent instance or function with NEXUS CORE 2.0.
    """
    from app.services.registry import register_custom_agent_instance

    if isinstance(agent_or_fn, NexusAgent):
        inst = agent_or_fn
        name = name or getattr(inst, "name", "CustomAgent")
        role = role or getattr(inst, "role", "analysis")
        description = description or getattr(inst, "description", "")
        capabilities = capabilities or getattr(inst, "capabilities", ["read_data"])
        permission_set = permission_set or getattr(inst, "permission_set", ["read_data"])
    elif callable(agent_or_fn):
        name = name or agent_or_fn.__name__
        role = role or "analysis"
        description = description or (agent_or_fn.__doc__ or "Custom functional agent")
        capabilities = capabilities or ["read_data"]
        permission_set = permission_set or ["read_data"]
        inst = FunctionAgentAdapter(agent_or_fn, name, role, description, capabilities, permission_set)
    else:
        raise ValueError("Agent must be a callable or inherit from NexusAgent")

    # 1. Register in memory runtime map
    register_custom_agent_instance(name, inst)

    # 2. Sync to database if session provided
    if db is not None:
        sync_agent_record(db, name, role, description, capabilities, permission_set)
    return inst


def nexus_agent(name: Optional[str] = None, role: str = "analysis",
                description: str = "",
                capabilities: Optional[List[str]] = None,
                permission_set: Optional[List[str]] = None):
    """
    High-level decorator for creating and auto-registering custom NEXUS agents.
    """
    def decorator(fn_or_cls: Any) -> Any:
        nonlocal name, description
        if not name:
            name = fn_or_cls.__name__
        if not description and hasattr(fn_or_cls, "__doc__") and fn_or_cls.__doc__:
            description = fn_or_cls.__doc__.strip()

        if isinstance(fn_or_cls, type) and issubclass(fn_or_cls, NexusAgent):
            inst = fn_or_cls()
            register_custom_agent(inst, name=name, role=role, description=description,
                                  capabilities=capabilities, permission_set=permission_set)
            return fn_or_cls
        elif callable(fn_or_cls):
            adapter = FunctionAgentAdapter(fn_or_cls, name, role, description, capabilities, permission_set)
            register_custom_agent(adapter, name=name, role=role, description=description,
                                  capabilities=capabilities, permission_set=permission_set)
            @functools.wraps(fn_or_cls)
            def wrapper(*args, **kwargs):
                return fn_or_cls(*args, **kwargs)
            wrapper._nexus_adapter = adapter
            return wrapper
        else:
            raise TypeError("@nexus_agent must decorate a function or NexusAgent subclass")
    return decorator
