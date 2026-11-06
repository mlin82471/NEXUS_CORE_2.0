from dataclasses import dataclass
from typing import Optional
import threading

@dataclass
class AgentResult:
    result: str
    input_tokens: int
    output_tokens: int
    usage_source: str = "estimated"
    execution_mode: str = "real"  # "real" | "simulation"


class AgentError(Exception):
    """Base error for agent execution."""

class AgentTimeoutError(AgentError):
    """Agent exceeded timeout."""

class AgentExecutionError(AgentError):
    """Agent internal execution failure."""

class AgentCancelledError(AgentError):
    """Agent cancelled via cancel_event."""

class ExecutionRejectedError(AgentError):
    """Raised when simulation output is rejected for tasks requiring real execution."""
