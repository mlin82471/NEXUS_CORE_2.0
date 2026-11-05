"""
B1 Agent Runner & Dispatcher (§3, §4, B1-3).
Wraps Agent execution with timeout, cancellation, token tracking, and adapter gating.
"""
import threading
import time
import uuid
from typing import Any

from app.agents.base import (
    AgentCancelledError,
    AgentError,
    AgentExecutionError,
    AgentResult,
    AgentTimeoutError,
)
from app.b0.protocols import AgentData
from app.config import settings


class ExecutionOutcome:
    """Standardized result of an agent invocation."""

    def __init__(
        self,
        status: str,  # "completed", "failed", "timeout", "cancelled"
        result: str | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        usage_source: str = "unknown",
        error_message: str | None = None,
    ):
        self.status = status
        self.result = result
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.usage_source = usage_source
        self.error_message = error_message


def run_agent_safely(
    agent_record: AgentData,
    goal: str,
    context: dict | None = None,
    cancel_event: threading.Event | None = None,
    timeout_seconds: float = 30.0,
) -> ExecutionOutcome:
    """
    Executes an agent with strict isolation:
    - Default MockAgent.
    - DSH and Hermes require explicit system configuration (settings.enable_dsh_adapter / settings.enable_hermes_adapter).
    - True timeout detection.
    - Cancellation propagation.
    - Exceptions caught and packaged into ExecutionOutcome without crashing caller.
    """
    # 1. Check adapter enablement
    atype = agent_record.adapter_type
    if atype == "mock":
        from app.agents.mock import MockAgent
        agent_instance = MockAgent(agent_record.role)
    elif atype == "dsh":
        if not settings.enable_dsh_adapter:
            return ExecutionOutcome(
                status="failed",
                error_message="DSH adapter is disabled by configuration (settings.enable_dsh_adapter=False)",
            )
        from app.adapters.dsh import DSHAdapter
        agent_instance = DSHAdapter()
    elif atype == "hermes":
        if not settings.enable_hermes_adapter:
            return ExecutionOutcome(
                status="failed",
                error_message="Hermes adapter is disabled by configuration (settings.enable_hermes_adapter=False)",
            )
        from app.adapters.hermes import HermesAdapter
        agent_instance = HermesAdapter()
    elif atype == "antigravity":
        if not settings.enable_antigravity_adapter:
            return ExecutionOutcome(
                status="failed",
                error_message="Antigravity adapter is disabled by configuration (settings.enable_antigravity_adapter=False)",
            )
        from app.adapters.antigravity import AntigravityAdapter
        agent_instance = AntigravityAdapter()
    else:
        return ExecutionOutcome(
            status="failed",
            error_message=f"Unknown adapter_type {atype!r}",
        )

    # 2. Check early cancellation
    if cancel_event and cancel_event.is_set():
        return ExecutionOutcome(
            status="cancelled",
            error_message="Execution cancelled before start",
            usage_source="unknown",
        )

    # 3. Execute in a monitored thread with timeout
    worker_result: list[Any] = []
    worker_error: list[Exception] = []

    def _worker():
        try:
            # Check arguments accepted by agent_instance.run
            import inspect
            sig = inspect.signature(agent_instance.run)
            kwargs = {}
            if "cancel_event" in sig.parameters:
                kwargs["cancel_event"] = cancel_event
            if "context" in sig.parameters:
                kwargs["context"] = context
            if "timeout_seconds" in sig.parameters:
                kwargs["timeout_seconds"] = timeout_seconds

            res = agent_instance.run(goal, **kwargs)
            worker_result.append(res)
        except Exception as exc:
            worker_error.append(exc)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout=timeout_seconds)

    if t.is_alive():
        # Timeout occurred!
        if cancel_event:
            cancel_event.set()
        return ExecutionOutcome(
            status="timeout",
            error_message=f"Agent exceeded timeout of {timeout_seconds}s",
            usage_source="unknown",
        )

    if cancel_event and cancel_event.is_set():
        return ExecutionOutcome(
            status="cancelled",
            error_message="Agent execution was cancelled via cancel_event",
            usage_source="unknown",
        )

    if worker_error:
        exc = worker_error[0]
        if isinstance(exc, AgentCancelledError):
            return ExecutionOutcome(
                status="cancelled",
                error_message=str(exc),
                usage_source="unknown",
            )
        elif isinstance(exc, AgentTimeoutError):
            return ExecutionOutcome(
                status="timeout",
                error_message=str(exc),
                usage_source="unknown",
            )
        else:
            return ExecutionOutcome(
                status="failed",
                error_message=str(exc) or exc.__class__.__name__,
                usage_source="unknown",
            )

    if not worker_result:
        return ExecutionOutcome(
            status="failed",
            error_message="Agent returned no result",
            usage_source="unknown",
        )

    res = worker_result[0]
    if isinstance(res, AgentResult):
        if res.usage_source == "cancelled":
            return ExecutionOutcome(
                status="cancelled",
                result=res.result,
                input_tokens=res.input_tokens,
                output_tokens=res.output_tokens,
                usage_source="cancelled",
            )
        return ExecutionOutcome(
            status="completed",
            result=res.result,
            input_tokens=res.input_tokens,
            output_tokens=res.output_tokens,
            usage_source=res.usage_source,
        )
    else:
        return ExecutionOutcome(
            status="completed",
            result=str(res),
            usage_source="unknown",
        )
