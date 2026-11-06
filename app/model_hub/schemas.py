"""
NEXUS CORE 2.1 — Model Hub Schemas (§MODEL-HUB-SCHEMAS).
Pydantic contracts for Model Providers, Model Configuration,
Capabilities, Pricing, Connection Testing, and Smart Routing.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ProviderType(str, Enum):
    DEEPSEEK = "deepseek"
    QWEN = "qwen"
    OPENAI = "openai"
    GEMINI = "gemini"
    CLAUDE = "claude"
    OLLAMA = "ollama"
    CUSTOM = "custom_openai_compatible"


class RoutingMode(str, Enum):
    MANUAL = "manual"
    AUTO_COMPLEXITY = "auto_complexity"
    COST_OPTIMIZED = "cost_optimized"


class ModelCapability(BaseModel):
    supports_tools: bool = True
    supports_vision: bool = False
    supports_streaming: bool = True
    supports_reasoning: bool = False
    context_window: int = 64000
    max_output_tokens: int = 8192


class ModelPricing(BaseModel):
    input_price_per_m: float = 0.14    # USD per 1,000,000 tokens
    output_price_per_m: float = 0.28   # USD per 1,000,000 tokens
    cached_discount_pct: float = 50.0  # % discount for cached input
    currency: str = "USD"


class ModelConfig(BaseModel):
    model_id: str = Field(..., description="Unique model identifier, e.g. deepseek-chat")
    provider_type: ProviderType
    display_name: str
    api_base: str
    credential_ref: str = Field(..., description="Encrypted or masked key reference, e.g. sk-****a8f2")
    capabilities: ModelCapability = Field(default_factory=ModelCapability)
    pricing: ModelPricing = Field(default_factory=ModelPricing)
    enabled: bool = True
    is_default: bool = False
    health_status: str = "connected"   # connected, degraded, disconnected
    last_ping_ms: float = 38.0
    created_at: str = ""
    updated_at: str = ""


class ModelCreateRequest(BaseModel):
    model_id: str
    provider_type: ProviderType
    display_name: str
    api_base: Optional[str] = None
    api_key: str = Field(..., min_length=1, description="Raw API key; will be masked upon saving")
    capabilities: Optional[ModelCapability] = None
    pricing: Optional[ModelPricing] = None
    is_default: bool = False


class ProviderPreset(BaseModel):
    provider_type: ProviderType
    display_name: str
    default_api_base: str
    description: str
    icon: str
    docs_url: str
    recommended_models: List[str]


class ConnectionTestRequest(BaseModel):
    provider_type: ProviderType
    api_base: str
    api_key: str
    model_id: Optional[str] = None


class ConnectionTestResponse(BaseModel):
    ok: bool
    latency_ms: float
    reported_models: List[str]
    message: str
    error: Optional[str] = None


class RoutingPolicy(BaseModel):
    mode: RoutingMode = RoutingMode.AUTO_COMPLEXITY
    manual_model_id: Optional[str] = "deepseek-chat"
    cost_threshold_usd_per_m: float = 1.0
    fallback_model_id: str = "qwen-plus"
    audit_reason: str = "Default system dynamic routing"
