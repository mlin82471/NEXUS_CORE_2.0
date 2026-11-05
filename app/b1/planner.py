"""
B1 Planner 2.0 - Goal-to-SubTask planning engine.
Calls configured LLM via OpenAI-compatible API; falls back to rule-based plan.

Conforms to:
- B0 SubTaskData
- B0 PersistenceProtocol
"""

import json, logging, httpx, os, uuid
from typing import Optional
from app.b0.protocols import SubTaskData
from app.config import settings

log = logging.getLogger("nexus.b1.planner")

ROLES = {"research", "coding", "analysis", "knowledge", "execution", "verification"}
MAX_GOAL_LENGTH = 10000
MAX_STEP_GOAL_LENGTH = 5000
MAX_STEPS = 10

SYSTEM_PROMPT = """You are NEXUS, an autonomous agent orchestrator.

Break down the user's goal into a structured execution plan.
Output ONLY a JSON object with a "steps" array. Each step:
- step_key (string): short machine key like "s1", "s2"
- goal (string): detailed sub-goal for this step
- role (string): one of {roles}
- depends_on (array of strings): step_keys this step waits for
- acceptance_criteria (array of strings): 1-3 verifiable criteria for success

Constraints:
- 1 to {max_steps} steps.
- Every role must be from the allowed list: {roles}
- No circular dependencies.
- depends_on only references earlier step_keys.
- Each step needs at least 1 acceptance_criteria."""

REPLAN_PROMPT = """You are NEXUS, an autonomous agent orchestrator.

The following task was attempted but some steps failed or were inconclusive.
Generate a REVISED plan for the FAILED portions ONLY.

ORIGINAL GOAL: {goal}

PREVIOUSLY SUCCEEDED STEPS (do NOT re-plan these):
{succeeded}

FAILED / INCONCLUSIVE STEPS (re-plan replacements for these):
{failed}

VERIFIER ISSUES:
{issues}

Output ONLY a JSON object with a "steps" array for the replacement steps.
Use the same format as the original plan.
Do NOT include steps that already succeeded."""


class PlannerError(ValueError):
    """Planner error - caller should fall back to rule_plan."""


def _validate_goal(goal: str) -> None:
    if not isinstance(goal, str) or not goal.strip():
        raise PlannerError("goal must be a non-blank string")
    if len(goal) > MAX_GOAL_LENGTH:
        raise PlannerError(f"goal exceeds {MAX_GOAL_LENGTH} characters")


def _extract_content(response_json: dict) -> str:
    choices = response_json.get("choices")
    if not isinstance(choices, list) or len(choices) == 0:
        raise PlannerError("API response missing choices")
    msg = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(msg, dict):
        raise PlannerError("API response missing message")
    content = msg.get("content")
    if not content or not isinstance(content, str) or not content.strip():
        raise PlannerError("API returned empty content")
    return content.strip()


def _parse_steps(content: str, budget_steps: int) -> list[dict]:
    try:
        plan_dict = json.loads(content)
    except json.JSONDecodeError:
        raise PlannerError("API returned invalid JSON")
    if not isinstance(plan_dict, dict) or "steps" not in plan_dict:
        raise PlannerError("API response missing 'steps' key")
    steps = plan_dict["steps"]
    if not isinstance(steps, list):
        raise PlannerError("steps is not a list")
    if len(steps) > budget_steps:
        raise PlannerError(f"Planner returned {len(steps)} steps, exceeds budget {budget_steps}")
    return steps


def _validate_step(step: dict, step_index: int) -> None:
    key = step.get("step_key", "")
    if not isinstance(key, str) or not key.strip():
        raise PlannerError(f"Step {step_index}: blank step_key")
    goal = step.get("goal", "")
    if not isinstance(goal, str) or not goal.strip():
        raise PlannerError(f"Step {step_index}: blank goal")
    if len(goal) > MAX_STEP_GOAL_LENGTH:
        raise PlannerError(f"Step {step_index}: goal exceeds {MAX_STEP_GOAL_LENGTH} chars")
    role = step.get("role", "")
    if role not in ROLES:
        raise PlannerError(f"Step {step_index}: unknown role {role!r}")


def _api_base_url() -> str:
    return os.environ.get("DASHSCOPE_BASE_URL",
                          os.environ.get("PLANNER_BASE_URL",
                          "https://dashscope.aliyuncs.com/compatible-mode/v1"))


def _api_key() -> str:
    return os.environ.get("DASHSCOPE_API_KEY", "")


def _call_llm(system_prompt: str, user_content: str, budget_steps: int) -> list[dict]:
    if not _api_key():
        raise PlannerError("DASHSCOPE_API_KEY not configured")
    model = os.environ.get("PLANNER_MODEL", settings.planner_model)
    timeout = float(os.environ.get("PLANNER_TIMEOUT", "60"))
    try:
        resp = httpx.post(
            f"{_api_base_url()}/chat/completions",
            headers={
                "Authorization": f"Bearer {_api_key()}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "max_tokens": 2000,
            },
            timeout=timeout,
        )
    except httpx.TimeoutException:
        raise PlannerError(f"Planner API timed out after {timeout}s")
    except httpx.RequestError as e:
        raise PlannerError(f"Planner connection failed: {e.__class__.__name__}")
    if resp.status_code == 401:
        raise PlannerError("Planner authentication failed (HTTP 401)")
    if resp.status_code == 429:
        raise PlannerError("Planner rate limited (HTTP 429)")
    if resp.status_code != 200:
        raise PlannerError(f"Planner returned HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception:
        raise PlannerError("Planner returned non-JSON response")
    content = _extract_content(data)
    return _parse_steps(content, budget_steps)


def _steps_to_subtask_data(task_id: str, plan_version: int, steps: list[dict]) -> list[SubTaskData]:
    step_keys = {s.get("step_key", "") for s in steps}
    result = []
    for i, s in enumerate(steps):
        key = s["step_key"].strip()
        role = s.get("role", "analysis")
        deps = s.get("depends_on", [])
        if not isinstance(deps, list):
            deps = []
        deps = [d for d in deps if d in step_keys]
        criteria = s.get("acceptance_criteria", [])
        if not isinstance(criteria, list) or len(criteria) == 0:
            criteria = [f"Complete: {s['goal'][:200]}"]
        result.append(SubTaskData(
            id=str(uuid.uuid4()),
            task_id=task_id,
            step_key=key,
            plan_version=plan_version,
            is_active=1,
            goal=s["goal"].strip(),
            role=role,
            required_permissions=_role_permissions(role),
            acceptance_criteria=criteria,
            depends_on=deps,
            step_order=i,
        ))
    return result


def _role_permissions(role: str) -> list[str]:
    mapping = {
        "analysis": ["read_data", "reason"],
        "coding": ["read_files", "write_files", "execute_code"],
        "verification": ["read_data", "validate"],
        "execution": ["execute_code", "write_files"],
        "knowledge": ["read_data", "search"],
        "research": ["read_data", "search", "reason"],
    }
    return mapping.get(role, ["read_data"])


def plan(
    goal: str,
    budget_steps: int = 10,
    context: dict | None = None,
    task_id: str | None = None,
) -> list[SubTaskData]:
    _validate_goal(goal)
    budget_steps = max(1, min(int(budget_steps), MAX_STEPS))
    tid = task_id or str(uuid.uuid4())
    system_prompt = SYSTEM_PROMPT.format(roles=sorted(ROLES), max_steps=budget_steps)
    user_content = goal
    if context:
        extra = context.get("extra_context", "")
        if extra:
            user_content = goal + chr(10) + chr(10) + "Additional context:" + chr(10) + extra
    raw_steps = _call_llm(system_prompt, user_content, budget_steps)
    for i, s in enumerate(raw_steps):
        _validate_step(s, i)
    return _steps_to_subtask_data(tid, plan_version=0, steps=raw_steps)


def replan(
    task_goal: str,
    failed_subtasks: list[SubTaskData],
    verifier_issues: list[str],
    budget_steps: int = 10,
    succeeded_subtasks: list[SubTaskData] | None = None,
    task_id: str | None = None,
    plan_version: int = 1,
) -> list[SubTaskData]:
    _validate_goal(task_goal)
    budget_steps = max(1, min(int(budget_steps), MAX_STEPS))
    tid = task_id or str(uuid.uuid4())
    succeeded = succeeded_subtasks or []
    nl = chr(10)
    succeeded_text = nl.join(f"- {s.step_key}: {s.goal[:100]}" for s in succeeded) if succeeded else "(none)"
    failed_text = nl.join(
        f"- {s.step_key} [{s.verification_status}]: {s.goal[:100]}" + nl +
        f"  Error: {s.execution_error or 'none'}"
        for s in failed_subtasks
    )
    issues_text = nl.join(f"- {i}" for i in verifier_issues) if verifier_issues else "(none)"
    system_prompt = REPLAN_PROMPT.format(
        goal=task_goal,
        succeeded=succeeded_text,
        failed=failed_text,
        issues=issues_text,
    )
    raw_steps = _call_llm(system_prompt, f"Re-plan failed steps for: {task_goal}", budget_steps)
    for i, s in enumerate(raw_steps):
        _validate_step(s, i)
    return _steps_to_subtask_data(tid, plan_version=plan_version, steps=raw_steps)


def rule_plan(goal: str, role: str = "analysis", task_id: str | None = None) -> list[SubTaskData]:
    _validate_goal(goal)
    tid = task_id or str(uuid.uuid4())
    if role not in ROLES:
        role = "analysis"
    truncated = goal[:MAX_STEP_GOAL_LENGTH]
    return [SubTaskData(
        id=str(uuid.uuid4()),
        task_id=tid,
        step_key="s1",
        plan_version=0,
        is_active=1,
        goal=truncated,
        role=role,
        required_permissions=_role_permissions(role),
        acceptance_criteria=[f"Complete: {truncated[:200]}"],
        depends_on=[],
        step_order=0,
    )]
