"""
Qwen Plus Planner via Bailian API. Returns PlanSchema-validated steps.
"""
import json, logging
import httpx
from pydantic import ValidationError
from app.config import settings
from app.schemas import PlanSchema, PlanStepSchema, ROLES

log = logging.getLogger("nexus.planner")

MAX_GOAL_LENGTH = 10000
MAX_STEP_GOAL_LENGTH = 5000   # PlanStepSchema.goal max_length
MAX_STEPS = 10

SYSTEM_PROMPT = """You are NEXUS, an autonomous agent orchestrator.

Break down the user's goal into a structured execution plan.
Output ONLY a JSON object with a "steps" array. Each step:
- step_key (string): short machine key like "s1", "s2"
- title (string): short human-readable title
- goal (string): detailed sub-goal for this step
- role (string): one of {roles}
- depends_on (array of strings): step_keys this step waits for

Constraints (enforced by system, not negotiable):
- 1 to {max_steps} steps.
- Every role must be from the allowed list above.
- No circular dependencies.
- depends_on only references earlier step_keys."""


class PlanError(ValueError):
    """Planner-level error. Caller should fall back to rule-based plan."""
    pass


def _validate_input(goal: str, max_steps_budget: int) -> None:
    """Validate planner inputs before API call.
    
    max_steps_budget: maximum number of plan steps allowed (not agent count).
    """
    if not isinstance(goal, str):
        raise PlanError(f"goal must be a string, got {type(goal).__name__}")
    if not goal or not goal.strip():
        raise PlanError("goal must not be blank")
    if len(goal) > MAX_GOAL_LENGTH:
        raise PlanError(f"goal exceeds {MAX_GOAL_LENGTH} characters")
    if isinstance(max_steps_budget, bool) or not isinstance(max_steps_budget, int):
        raise PlanError(f"max_steps_budget must be an integer, got {type(max_steps_budget).__name__}")
    if max_steps_budget < 1:
        raise PlanError(f"max_steps_budget must be positive, got {max_steps_budget}")
    if max_steps_budget > MAX_STEPS:
        max_steps_budget = MAX_STEPS


async def call_planner(goal: str, budget_agents: int = 5) -> list[dict]:
    """Call Qwen Plus. Returns PlanSchema-validated step dicts.
    
    budget_agents: max number of plan steps (not agent count).
    Raises PlanError for any failure; caller should fall back to rule_fallback.
    """
    _validate_input(goal, budget_agents)
    budget_agents = min(budget_agents, MAX_STEPS)

    if not settings.planner_available:
        raise PlanError("Planner unavailable: DASHSCOPE_API_KEY not configured")

    system_msg = SYSTEM_PROMPT.format(
        roles=sorted(ROLES),
        max_steps=budget_agents,
    )

    # ---- API call with separated system/user messages ----
    try:
        async with httpx.AsyncClient(timeout=settings.planner_timeout) as client:
            resp = await client.post(
                f"{settings.planner_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.planner_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.planner_model,
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": goal},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                    "max_tokens": 2000,
                },
            )
    except httpx.TimeoutException:
        raise PlanError("Planner request timed out")
    except httpx.RequestError as exc:
        raise PlanError(f"Planner connection failed: {exc.__class__.__name__}")

    # ---- Status checks ----
    if resp.status_code == 401:
        raise PlanError("Planner authentication failed (HTTP 401)")
    if resp.status_code == 429:
        raise PlanError("Planner rate limited (HTTP 429)")
    if resp.status_code != 200:
        raise PlanError(f"Planner returned HTTP {resp.status_code}")

    # ---- Parse JSON body ----
    try:
        data = resp.json()
    except (json.JSONDecodeError, ValueError):
        raise PlanError("Planner returned non-JSON response")

    if not isinstance(data, dict):
        raise PlanError("Planner response is not a JSON object")

    # ---- Extract content with full structure validation ----
    try:
        choices = data.get("choices")
        if not isinstance(choices, list) or len(choices) == 0:
            raise PlanError("Planner response missing or empty choices")
        choice0 = choices[0]
        if not isinstance(choice0, dict):
            raise PlanError("Planner response choice is not a dict")
        message = choice0.get("message")
        if not isinstance(message, dict):
            raise PlanError("Planner response missing or invalid message")
        content = message.get("content")
    except (KeyError, IndexError, TypeError):
        raise PlanError("Planner returned unexpected response structure")

    if content is None or not isinstance(content, str) or not content.strip():
        raise PlanError("Planner returned empty content")

    # ---- Parse JSON from content ----
    try:
        plan_dict = json.loads(content)
    except json.JSONDecodeError:
        raise PlanError("Planner returned invalid JSON")

    if not isinstance(plan_dict, dict) or "steps" not in plan_dict:
        raise PlanError("Planner JSON missing 'steps' key")

    # ---- Validate via PlanSchema (catch only ValidationError) ----
    try:
        validated = PlanSchema.model_validate(plan_dict)
    except ValidationError:
        raise PlanError("Planner output failed schema validation")
    except Exception:
        raise PlanError("Unexpected validation error")

    # ---- Step count budget check ----
    if len(validated.steps) > budget_agents:
        raise PlanError(f"Planner returned {len(validated.steps)} steps, exceeds budget {budget_agents}")

    return [s.model_dump() for s in validated.steps]


def rule_fallback(goal: str, task_type: str, max_steps: int = 3) -> list[dict]:
    """Rule-based single-step plan. Always passes PlanSchema validation.
    
    max_steps: reserved for future multi-step rule plans. M0-A always produces 1 step.
    """
    # Input validation (same as _validate_input)
    if not isinstance(goal, str):
        raise PlanError(f"goal must be a string, got {type(goal).__name__}")
    if not goal or not goal.strip():
        raise PlanError("goal must not be blank in rule fallback")
    if len(goal) > MAX_GOAL_LENGTH:
        raise PlanError(f"goal too long for fallback: {len(goal)} > {MAX_GOAL_LENGTH}")
    if len(goal) > MAX_STEP_GOAL_LENGTH:
        raise PlanError(f"goal exceeds {MAX_STEP_GOAL_LENGTH} char limit of PlanStepSchema, cannot create fallback step")

    max_steps = max(1, min(int(max_steps), MAX_STEPS))
    role = task_type if task_type in ROLES else "analysis"
    steps = [{"step_key": "s1", "title": "Complete task",
              "goal": goal, "role": role, "depends_on": []}]
    validated = PlanSchema.model_validate({"steps": steps})
    return [s.model_dump() for s in validated.steps]
