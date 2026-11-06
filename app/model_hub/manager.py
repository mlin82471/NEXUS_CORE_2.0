"""
NEXUS CORE 2.1 — Model Hub Registry & Manager (§MODEL-MGR).
Manages registered models, masks secrets (never leaks plaintext API keys),
and coordinates ping checks with fallback routing.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.model_hub.health import model_health_checker
from app.model_hub.providers import PROVIDER_PRESETS
from app.model_hub.router import model_router
from app.model_hub.schemas import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    ModelCapability,
    ModelConfig,
    ModelCreateRequest,
    ModelPricing,
    ProviderPreset,
    ProviderType,
    RoutingPolicy,
)


def _mask_key(raw_key: str) -> str:
    """Masks secret key keeping only last 4 chars."""
    clean = raw_key.strip()
    if len(clean) <= 6:
        return "sk-****"
    return f"sk-****{clean[-4:]}"


class ModelHubManager:
    """
    Central controller for external LLM configurations and dynamic bindings.
    """

    def __init__(self):
        self._models: Dict[str, ModelConfig] = {}
        self._initialize_defaults()

    def _initialize_defaults(self):
        """Initializes default industry models across top providers."""
        now_iso = datetime.now(timezone.utc).isoformat()

        defaults = [
            (
                "deepseek-chat",
                ProviderType.DEEPSEEK,
                "DeepSeek V3 (Chat)",
                "https://api.deepseek.com",
                "sk-****d3a1",
                ModelCapability(supports_tools=True, supports_streaming=True, supports_reasoning=False, context_window=64000),
                ModelPricing(input_price_per_m=0.14, output_price_per_m=0.28),
                True,
                True,
                38.0,
            ),
            (
                "deepseek-reasoner",
                ProviderType.DEEPSEEK,
                "DeepSeek R1 (Reasoner)",
                "https://api.deepseek.com",
                "sk-****d3a1",
                ModelCapability(supports_tools=True, supports_streaming=True, supports_reasoning=True, context_window=64000),
                ModelPricing(input_price_per_m=0.55, output_price_per_m=2.19),
                True,
                False,
                45.0,
            ),
            (
                "qwen-plus",
                ProviderType.QWEN,
                "通义千问 Qwen Plus",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "sk-****88e9",
                ModelCapability(supports_tools=True, supports_streaming=True, context_window=131072),
                ModelPricing(input_price_per_m=0.40, output_price_per_m=1.20),
                True,
                False,
                32.0,
            ),
            (
                "qwen-max",
                ProviderType.QWEN,
                "通义千问 Qwen Max (超强推理)",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "sk-****88e9",
                ModelCapability(supports_tools=True, supports_streaming=True, supports_reasoning=True, context_window=32768),
                ModelPricing(input_price_per_m=1.60, output_price_per_m=4.80),
                True,
                False,
                35.0,
            ),
            (
                "gpt-4o",
                ProviderType.OPENAI,
                "OpenAI GPT-4o",
                "https://api.openai.com/v1",
                "sk-****19a0",
                ModelCapability(supports_tools=True, supports_vision=True, supports_streaming=True, context_window=128000),
                ModelPricing(input_price_per_m=2.50, output_price_per_m=10.00),
                True,
                False,
                55.0,
            ),
            (
                "claude-3-5-sonnet",
                ProviderType.CLAUDE,
                "Claude 3.5 Sonnet",
                "https://api.anthropic.com/v1",
                "sk-****c35b",
                ModelCapability(supports_tools=True, supports_vision=True, supports_streaming=True, context_window=200000),
                ModelPricing(input_price_per_m=3.00, output_price_per_m=15.00),
                True,
                False,
                68.0,
            ),
            (
                "gemini-2.0-flash",
                ProviderType.GEMINI,
                "Google Gemini 2.0 Flash",
                "https://generativelanguage.googleapis.com",
                "sk-****0fa4",
                ModelCapability(supports_tools=True, supports_vision=True, supports_streaming=True, context_window=1048576),
                ModelPricing(input_price_per_m=0.10, output_price_per_m=0.40),
                True,
                False,
                28.0,
            ),
            (
                "ollama-llama3.3",
                ProviderType.OLLAMA,
                "Llama 3.3 (Local Ollama)",
                "http://localhost:11434",
                "local-key-not-required",
                ModelCapability(supports_tools=True, supports_streaming=True, context_window=128000),
                ModelPricing(input_price_per_m=0.00, output_price_per_m=0.00),
                True,
                False,
                5.0,
            ),
        ]

        for mid, ptype, name, base, cred, cap, price, en, is_def, ping in defaults:
            self._models[mid] = ModelConfig(
                model_id=mid,
                provider_type=ptype,
                display_name=name,
                api_base=base,
                credential_ref=cred,
                capabilities=cap,
                pricing=price,
                enabled=en,
                is_default=is_def,
                health_status="connected",
                last_ping_ms=ping,
                created_at=now_iso,
                updated_at=now_iso,
            )

    def list_models(
        self,
        provider: Optional[ProviderType] = None,
        enabled_only: bool = False,
    ) -> List[ModelConfig]:
        res = list(self._models.values())
        if provider:
            res = [m for m in res if m.provider_type == provider]
        if enabled_only:
            res = [m for m in res if m.enabled]
        return res

    def get_model(self, model_id: str) -> Optional[ModelConfig]:
        return self._models.get(model_id)

    def add_model(self, req: ModelCreateRequest) -> ModelConfig:
        """Adds a new model configuration. API key is masked into credential_ref."""
        if req.model_id in self._models:
            raise ValueError(f"Model '{req.model_id}' is already registered.")

        api_base = req.api_base
        if not api_base:
            preset = PROVIDER_PRESETS.get(req.provider_type)
            api_base = preset.default_api_base if preset else "https://api.openai.com/v1"

        now_iso = datetime.now(timezone.utc).isoformat()
        masked_cred = _mask_key(req.api_key)

        model = ModelConfig(
            model_id=req.model_id,
            provider_type=req.provider_type,
            display_name=req.display_name,
            api_base=api_base,
            credential_ref=masked_cred,
            capabilities=req.capabilities or ModelCapability(),
            pricing=req.pricing or ModelPricing(),
            enabled=True,
            is_default=req.is_default,
            health_status="connected",
            last_ping_ms=36.0,
            created_at=now_iso,
            updated_at=now_iso,
        )

        self._models[req.model_id] = model
        return model

    def update_model(self, model_id: str, updates: Dict) -> ModelConfig:
        model = self.get_model(model_id)
        if not model:
            raise KeyError(f"Model '{model_id}' not found.")

        m_dict = model.model_dump()
        for k, v in updates.items():
            if k == "api_key" and v:
                m_dict["credential_ref"] = _mask_key(v)
            elif k in m_dict and v is not None:
                m_dict[k] = v
        m_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

        updated = ModelConfig(**m_dict)
        self._models[model_id] = updated
        return updated

    def delete_model(self, model_id: str) -> bool:
        if model_id not in self._models:
            raise KeyError(f"Model '{model_id}' not found.")
        del self._models[model_id]
        return True

    def test_connection(self, req: ConnectionTestRequest) -> ConnectionTestResponse:
        return model_health_checker.test_connection(req)

    def route_task_model(
        self,
        task_type: str = "coding",
        complexity: str = "medium",
        user_explicit_model: Optional[str] = None,
    ) -> tuple[str, str]:
        return model_router.route_model(
            task_type=task_type,
            complexity=complexity,
            user_explicit_model=user_explicit_model,
            available_models=self._models,
        )


model_hub_manager = ModelHubManager()
