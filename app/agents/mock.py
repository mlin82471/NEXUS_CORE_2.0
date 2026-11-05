from app.agents.base import AgentResult

class MockAgent:
    def __init__(self, role: str):
        self.role = role

    def run(self, goal: str, cancel_event=None) -> AgentResult:
        if cancel_event and cancel_event.is_set():
            return AgentResult("[MOCK] Cancelled", 0, 0, "cancelled")
        result = (
            f"[MOCK/{self.role}] Goal: {goal}\n\n"
            "NEXUS CORE 2.0 simulation result. "
            "No real model was called for this step."
        )
        input_tokens = max(1, len(goal) // 4)
        output_tokens = max(1, len(result) // 4)
        return AgentResult(result, input_tokens, output_tokens, "estimated")
