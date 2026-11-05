"""
HermesAdapter - True wall-clock timeout via multiprocessing (Windows-safe).
"""

import os, json, uuid
from multiprocessing import Process, Queue
from app.agents.base import (
    AgentResult, AgentTimeoutError, AgentExecutionError
)
from app.config import settings

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

HERMES_TIMEOUT = int(os.environ.get("HERMES_TIMEOUT", "120"))
HERMES_MODEL = os.environ.get("HERMES_MODEL", "gemini-3.8-flash-medium")

def _do_run_worker(api_key, base_url, model, goal, context, result_queue):
    """Runs in a child process. Sends result or error via queue."""
    try:
        client = OpenAI(api_key=api_key, base_url=base_url, max_retries=1, timeout=30.0)
        system_prompt = "You are a helpful AI assistant. Answer concisely."
        if context and context.get("task_goal"):
            system_prompt += "\n\nTask goal: " + context["task_goal"]
        response = client.chat.completions.create(
            model=model,
            messages=[{"role":"system","content":system_prompt},{"role":"user","content":goal}],
            max_tokens=2000,
        )
        choice = response.choices[0]
        usage = response.usage
        result_queue.put({
            "ok": True, "result": choice.message.content or "",
            "input_tokens": usage.prompt_tokens if usage else 0,
            "output_tokens": usage.completion_tokens if usage else 0,
            "usage_source": "measured" if usage else "estimated",
        })
    except Exception as e:
        result_queue.put({"ok": False, "error": str(e)})


class HermesAdapter:
    """True process-level timeout using multiprocessing."""

    def __init__(self):
        if OpenAI is None:
            raise RuntimeError("openai package required: pip install openai")
        api_key = os.environ.get("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise RuntimeError("DASHSCOPE_API_KEY not set")
        self._api_key = api_key
        self._base_url = os.environ.get("DASHSCOPE_BASE_URL",
            "https://dashscope.aliyuncs.com/compatible-mode/v1")
        self._model = HERMES_MODEL
        self.agent_id = "hermes-adapter"
        self.role = "analysis"
        self.adapter_type = "hermes"
        self.capabilities = ["read_data", "reason", "search"]

    def run(self, goal, context=None, cancel_event=None, timeout_seconds=None):
        if context is not None and not isinstance(context, dict):
            cancel_event = context
            context = None
        timeout = timeout_seconds or HERMES_TIMEOUT
        ctx = context or {}
        if isinstance(ctx, dict):
            ctx = {k: v for k, v in ctx.items()
                   if isinstance(k, str) and isinstance(v, (str, int, float, bool, list, dict, type(None)))}

        q = Queue()
        p = Process(target=_do_run_worker,
                    args=(self._api_key, self._base_url, self._model, goal, ctx, q))
        p.start()
        p.join(timeout)
        if p.is_alive():
            p.terminate()
            p.join(5)
            raise AgentTimeoutError(f"Hermes call exceeded {timeout}s")
        if q.empty():
            p.close()
            raise AgentExecutionError("Hermes worker produced no result")
        data = q.get()
        p.close()
        if data.get("ok"):
            return AgentResult(
                result=data["result"],
                input_tokens=data.get("input_tokens", 0),
                output_tokens=data.get("output_tokens", 0),
                usage_source=data.get("usage_source", "estimated"),
            )
        raise AgentExecutionError(data.get("error", "Unknown error"))

    def capabilities_match(self, required):
        return all(c in self.capabilities for c in required)

    def estimated_tokens(self, goal):
        return max(100, len(goal) // 2)

    def health_check(self):
        try:
            client = OpenAI(api_key=self._api_key, base_url=self._base_url,
                          max_retries=0, timeout=5)
            models = client.models.list()
            return len(models.data) > 0
        except Exception:
            return False
