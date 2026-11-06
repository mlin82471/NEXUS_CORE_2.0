"""
NEXUS CORE 2.1 — NEXUS DEV Requirements Engineering (§DEV-2).
Decomposes raw user requests into testable functional specifications and criteria.
"""

import re
import uuid
from typing import List, Optional
from app.dev.schemas import DevRequirement


class RequirementsAnalyzer:
    """
    Transforms natural language software requests into structured DEV requirements.
    """

    def analyze(self, user_prompt: str, title: Optional[str] = None) -> DevRequirement:
        req_id = f"req-{uuid.uuid4().hex[:8]}"
        clean_prompt = user_prompt.strip()

        # Extract title if not provided
        derived_title = title
        if not derived_title:
            first_line = clean_prompt.split("\n")[0][:60]
            derived_title = re.sub(r"^[#\s\-\*]+", "", first_line)

        # Detect functional specifications
        specs: List[str] = []
        criteria: List[str] = []

        lines = [line.strip() for line in clean_prompt.split("\n") if line.strip()]
        for line in lines:
            if re.search(r"\b(?:support|implement|build|create|add|provide|fix|handle)\b", line, re.IGNORECASE):
                specs.append(line)
            if re.search(r"\b(?:must|should|assert|return|status|test|json|api|timeout)\b", line, re.IGNORECASE):
                criteria.append(line)

        if not specs:
            specs.append(f"Deliver core software solution for: {derived_title}")
        if not criteria:
            criteria.append("Must pass all automated unit and integration tests without errors.")
            criteria.append("Must produce clean Python AST syntax without syntax or runtime exceptions.")

        # Determine target language
        target_lang = "python"
        if re.search(r"\b(?:typescript|react|javascript|node|vite)\b", clean_prompt, re.IGNORECASE):
            target_lang = "typescript"
        elif re.search(r"\b(?:go|golang)\b", clean_prompt, re.IGNORECASE):
            target_lang = "go"

        return DevRequirement(
            requirement_id=req_id,
            title=derived_title,
            raw_user_prompt=clean_prompt,
            functional_specs=specs,
            acceptance_criteria=criteria,
            target_language=target_lang,
        )
