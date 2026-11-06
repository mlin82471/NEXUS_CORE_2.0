"""
NEXUS CORE 2.1 — Agent Control API Endpoints.
Prefix: /api/agents
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.agents.manager import agent_manager
from app.agents.schemas import (
    AgentCreateWizardRequest,
    AgentDetailResponse,
    AgentRole,
    AgentStatus,
    AgentTemplate,
    AgentTestRequest,
    AgentTestResponse,
)
from app.agents.templates import list_templates, get_template

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=List[AgentDetailResponse])
def get_agents(
    role: Optional[AgentRole] = None,
    status: Optional[AgentStatus] = None,
    search: Optional[str] = None,
):
    """List registered agents with optional filters."""
    return agent_manager.list_agents(role=role, status=status, search=search)


@router.get("/templates", response_model=List[AgentTemplate])
def get_agent_templates():
    """List all available built-in Agent templates."""
    return list_templates()


@router.get("/templates/{template_id}", response_model=AgentTemplate)
def get_agent_template_by_id(template_id: str):
    """Get single Agent template details."""
    try:
        return get_template(template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found")


@router.get("/{agent_id}", response_model=AgentDetailResponse)
def get_agent(agent_id: str):
    """Get details and runtime telemetry for a specific agent."""
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return agent


@router.post("", response_model=AgentDetailResponse, status_code=201)
def create_agent(req: AgentCreateWizardRequest):
    """Create a new agent via the 5-step wizard or custom configuration."""
    try:
        return agent_manager.create_agent_wizard(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{agent_id}", response_model=AgentDetailResponse)
def update_agent(agent_id: str, updates: dict):
    """Update agent configuration."""
    try:
        return agent_manager.update_agent(agent_id, updates)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{agent_id}/toggle", response_model=AgentDetailResponse)
def toggle_agent(agent_id: str):
    """Toggle agent status between ACTIVE and PAUSED."""
    try:
        return agent_manager.toggle_agent_status(agent_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{agent_id}")
def delete_agent(agent_id: str):
    """Delete a custom agent."""
    try:
        agent_manager.delete_agent(agent_id)
        return {"ok": True, "message": f"Agent '{agent_id}' deleted."}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{agent_id}/test", response_model=AgentTestResponse)
def test_agent(agent_id: str, req: AgentTestRequest):
    """Run an isolated test execution for the agent."""
    try:
        return agent_manager.test_agent_run(agent_id, req)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
