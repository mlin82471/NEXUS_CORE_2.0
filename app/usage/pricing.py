"""
NEXUS CORE 2.1 — Official Model Pricing Registry (§USAGE-PRICING).
Provides authoritative pricing per 1M tokens with prompt, completion,
cached tokens discount, and reasoning token calculation.
"""

from typing import Dict, Tuple

# Format: model_id -> (input_usd_per_m, output_usd_per_m, cached_discount_pct)
MODEL_PRICING_REGISTRY: Dict[str, Tuple[float, float, float]] = {
    # DeepSeek
    "deepseek-chat": (0.14, 0.28, 50.0),
    "deepseek-reasoner": (0.55, 2.19, 50.0),
    # Qwen (Aliyun)
    "qwen-turbo": (0.05, 0.15, 0.0),
    "qwen-plus": (0.40, 1.20, 0.0),
    "qwen-max": (1.60, 4.80, 0.0),
    "qwen-coder-plus": (0.50, 1.50, 0.0),
    # OpenAI
    "gpt-4o-mini": (0.15, 0.60, 50.0),
    "gpt-4o": (2.50, 10.00, 50.0),
    "o1": (15.00, 60.00, 50.0),
    "o3-mini": (1.10, 4.40, 50.0),
    # Google Gemini
    "gemini-2.0-flash": (0.10, 0.40, 75.0),
    "gemini-1.5-pro": (1.25, 5.00, 75.0),
    # Anthropic Claude
    "claude-3-5-sonnet": (3.00, 15.00, 90.0),
    "claude-3-5-haiku": (0.80, 4.00, 90.0),
    # Local Ollama / Offline
    "ollama-llama3.3": (0.00, 0.00, 0.0),
    "ollama": (0.00, 0.00, 0.0),
}


def compute_usage_cost_usd(
    model_id: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int = 0,
    reasoning_tokens: int = 0,
) -> float:
    """
    Computes exact USD cost for token consumption.
    Cached tokens receive provider-specific discounts.
    Reasoning tokens are billed as completion tokens.
    """
    rates = MODEL_PRICING_REGISTRY.get(model_id, (0.20, 0.60, 0.0))
    in_rate, out_rate, cache_discount = rates

    effective_prompt = max(0, prompt_tokens - cached_tokens)
    cached_in_rate = in_rate * (1.0 - (cache_discount / 100.0))

    cost_prompt = (effective_prompt / 1_000_000.0) * in_rate
    cost_cached = (cached_tokens / 1_000_000.0) * cached_in_rate
    
    total_output = completion_tokens + reasoning_tokens
    cost_completion = (total_output / 1_000_000.0) * out_rate

    total_cost = cost_prompt + cost_cached + cost_completion
    return round(total_cost, 6)
