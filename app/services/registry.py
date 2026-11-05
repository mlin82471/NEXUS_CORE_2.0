"""Agent registry: role whitelist, agent selection, adapter dispatch."""
from sqlalchemy.orm import Session
from app.config import settings
from app.models import Agent
from app.schemas import ROLES

FALLBACK_MAP: dict[str, list[str]] = {
    "verification": ["analysis"],
    "execution": ["coding"],
    "coding": ["analysis"],
    "knowledge": ["analysis"],
    "research": ["analysis"],
    "analysis": [],
}


def seed_default_agents(db: Session) -> list[Agent]:
    """Create default agents for all 6 roles if they don't exist.
    
    Hermes agents (verified) are preferred over Mock agents (declared).
    Capabilities and permission sets stored in metadata_json.
    """
    import json
    defaults = [
        ("Hermes Research", "research", "hermes", "verified",
         json.dumps({"capabilities":["read_data","search","reason"],"permission_set":["read_data","search","reason"]})),
        ("Hermes Coding", "coding", "hermes", "verified",
         json.dumps({"capabilities":["read_files","write_files","execute_code"],"permission_set":["read_files","write_files","execute_code"]})),
        ("Hermes Analysis", "analysis", "hermes", "verified",
         json.dumps({"capabilities":["read_data","reason"],"permission_set":["read_data","reason"]})),
        ("Hermes Knowledge", "knowledge", "hermes", "verified",
         json.dumps({"capabilities":["read_data","search"],"permission_set":["read_data","search"]})),
        ("Hermes Execution", "execution", "hermes", "verified",
         json.dumps({"capabilities":["execute_code","write_files"],"permission_set":["execute_code","write_files"]})),
        ("Hermes Verification", "verification", "hermes", "verified",
         json.dumps({"capabilities":["read_data","validate"],"permission_set":["read_data","validate"]})),
        ("Antigravity Coding", "coding", "antigravity", "verified",
         json.dumps({"capabilities":["read_files","write_files","execute_cmd","code_analysis","search","reason"],"permission_set":["read_files","write_files","execute_cmd"]})),
        ("Antigravity Execution", "execution", "antigravity", "verified",
         json.dumps({"capabilities":["execute_cmd","write_files","read_files"],"permission_set":["execute_cmd","write_files"]})),
        ("DSH Analysis", "analysis", "dsh", "verified",
         json.dumps({"capabilities":["read_data","reason","cluster_dispatch","system_ops"],"permission_set":["read_data","reason"]})),
        ("DSH Execution", "execution", "dsh", "verified",
         json.dumps({"capabilities":["cluster_dispatch","system_ops","execute_code"],"permission_set":["cluster_dispatch","system_ops"]})),
        ("Mock Research", "research", "mock", "declared",
         json.dumps({"capabilities":["mock"],"permission_set":[]})),
        ("Mock Coding", "coding", "mock", "declared",
         json.dumps({"capabilities":["mock"],"permission_set":[]})),
        ("Mock Analysis", "analysis", "mock", "declared",
         json.dumps({"capabilities":["mock"],"permission_set":[]})),
        ("Mock Knowledge", "knowledge", "mock", "declared",
         json.dumps({"capabilities":["mock"],"permission_set":[]})),
        ("Mock Execution", "execution", "mock", "declared",
         json.dumps({"capabilities":["mock"],"permission_set":[]})),
        ("Mock Verification", "verification", "mock", "declared",
         json.dumps({"capabilities":["mock"],"permission_set":[]})),
    ]
    created = []
    for name, role, atype, vstatus, meta_json in defaults:
        existing = db.query(Agent).filter(Agent.name == name).first()
        if not existing:
            meta = json.loads(meta_json)
            agent = Agent(
                name=name, role=role, adapter_type=atype,
                description=f"Default {role} agent ({atype.upper()})",
                verification_status=vstatus,
                capabilities=meta.get("capabilities", []),
                permission_set=meta.get("permission_set", []),
                metadata_json=meta,
            )
            db.add(agent)
            created.append(agent)
    if created:
        db.commit()
        for a in created:
            db.refresh(a)
    return created

# Dynamic In-Memory Registry for Custom SDK Agents
CUSTOM_AGENT_REGISTRY: dict[str, Any] = {}

def register_custom_agent_instance(name: str, instance: Any) -> None:
    CUSTOM_AGENT_REGISTRY[name] = instance

def get_custom_agent_instance(name: str) -> Any:
    return CUSTOM_AGENT_REGISTRY.get(name)


def _enabled_adapter_types() -> list[str]:
    """Return list of adapter types currently enabled in settings."""
    types = ["mock", "custom"]
    if settings.enable_hermes_adapter:
        types.append("hermes")
    if settings.enable_dsh_adapter:
        types.append("dsh")
    if settings.enable_antigravity_adapter:
        types.append("antigravity")
    return types


def pick_agent(db: Session, role: str) -> Agent:
    """Select the best agent for a role with deterministic ordering.
    
    Priority: verified exact match → any exact match → fallback chain.
    Only agents with currently enabled adapters are considered.
    Each tier sorted by agent id.
    """
    if role not in ROLES:
        raise ValueError(f"Unknown role {role!r}. Must be one of {ROLES}")

    allowed_adapters = _enabled_adapter_types()

    # Tier 1: exact role, verified, adapter enabled
    agent = db.query(Agent).filter(
        Agent.role == role, Agent.enabled.is_(True),
        Agent.verification_status == "verified",
        Agent.adapter_type.in_(allowed_adapters),
    ).order_by(Agent.id).first()

    # Tier 2: exact role, any enabled, adapter enabled
    if not agent:
        agent = db.query(Agent).filter(
            Agent.role == role, Agent.enabled.is_(True),
            Agent.adapter_type.in_(allowed_adapters),
        ).order_by(Agent.id).first()

    # Tier 3: fallback chain (only if exact match failed)
    if not agent:
        for fallback_role in FALLBACK_MAP.get(role, []):
            agent = db.query(Agent).filter(
                Agent.role == fallback_role, Agent.enabled.is_(True),
                Agent.adapter_type.in_(allowed_adapters),
            ).order_by(Agent.id).first()
            if agent:
                break

    if not agent:
        raise RuntimeError(f"No available agent for role {role!r}")
    return agent


def dispatch_agent(agent: Agent):
    """Return an executable agent instance for the given Agent record.
    Adapter gates are independent of Planner key."""
    atype = agent.adapter_type

    # 1. Custom SDK registered agent
    if atype == "custom" or agent.name in CUSTOM_AGENT_REGISTRY:
        custom_inst = CUSTOM_AGENT_REGISTRY.get(agent.name)
        if custom_inst:
            return custom_inst
        # Fallback for dynamic mock if instance was from another process
        from app.agents.mock import MockAgent
        return MockAgent(agent.role)

    if atype == "mock":
        from app.agents.mock import MockAgent
        return MockAgent(agent.role)

    if atype == "dsh":
        if not settings.enable_dsh_adapter:
            raise RuntimeError("DSH adapter not enabled (ENABLE_DSH_ADAPTER=false)")
        from app.adapters.dsh import DSHAdapter
        return DSHAdapter()

    if atype == "antigravity":
        if not settings.enable_antigravity_adapter:
            raise RuntimeError("Antigravity adapter not enabled (ENABLE_ANTIGRAVITY_ADAPTER=false)")
        from app.adapters.antigravity import AntigravityAdapter
        return AntigravityAdapter()

    if atype == "hermes":
        if not settings.enable_hermes_adapter:
            raise RuntimeError("Hermes adapter not enabled (ENABLE_HERMES_ADAPTER=false)")
        from app.adapters.hermes import HermesAdapter
        return HermesAdapter()

    raise RuntimeError(f"Unknown adapter_type {atype!r}")
