"""
NEXUS CORE 2.1 — Model Provider Presets & Metadata (§MODEL-PROVIDERS).
Covers DeepSeek, Qwen (Aliyun), OpenAI, Google Gemini, Anthropic Claude,
Ollama (local offline), and OpenAI-Compatible Custom endpoints.
"""

from typing import Dict, List
from app.model_hub.schemas import ProviderPreset, ProviderType

PROVIDER_PRESETS: Dict[ProviderType, ProviderPreset] = {
    ProviderType.DEEPSEEK: ProviderPreset(
        provider_type=ProviderType.DEEPSEEK,
        display_name="DeepSeek AI",
        default_api_base="https://api.deepseek.com",
        description="高性价比开源先锋，深度适配复杂代码生成与 DeepSeek-R1 链式推理。",
        icon="🧠",
        docs_url="https://platform.deepseek.com/api-docs",
        recommended_models=["deepseek-chat", "deepseek-reasoner"],
    ),
    ProviderType.QWEN: ProviderPreset(
        provider_type=ProviderType.QWEN,
        display_name="通义千问 Qwen (阿里云百炼)",
        default_api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
        description="全尺寸中文理解与多语言工程基座，高并发低延迟兼具超长上下文。",
        icon="🌐",
        docs_url="https://help.aliyun.com/document_detail/2712195.html",
        recommended_models=["qwen-turbo", "qwen-plus", "qwen-max", "qwen-coder-plus"],
    ),
    ProviderType.OPENAI: ProviderPreset(
        provider_type=ProviderType.OPENAI,
        display_name="OpenAI",
        default_api_base="https://api.openai.com/v1",
        description="业界标准 GPT 系列与 o1/o3-mini 推理模型，支持高级函数调用与结构化输出。",
        icon="⚡",
        docs_url="https://platform.openai.com/docs",
        recommended_models=["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    ),
    ProviderType.GEMINI: ProviderPreset(
        provider_type=ProviderType.GEMINI,
        display_name="Google Gemini",
        default_api_base="https://generativelanguage.googleapis.com",
        description="百万级超长上下文窗口、超强多模态理解与极速响应速度。",
        icon="✨",
        docs_url="https://ai.google.dev/docs",
        recommended_models=["gemini-2.0-flash", "gemini-1.5-pro", "gemini-2.0-flash-thinking-exp"],
    ),
    ProviderType.CLAUDE: ProviderPreset(
        provider_type=ProviderType.CLAUDE,
        display_name="Anthropic Claude",
        default_api_base="https://api.anthropic.com/v1",
        description="卓越的逻辑分析、代码工程严谨性与长文本深度理解能力。",
        icon="🎭",
        docs_url="https://docs.anthropic.com/en/docs/welcome",
        recommended_models=["claude-3-5-sonnet", "claude-3-5-haiku"],
    ),
    ProviderType.OLLAMA: ProviderPreset(
        provider_type=ProviderType.OLLAMA,
        display_name="Ollama (本地离线私有化)",
        default_api_base="http://localhost:11434",
        description="本地私有离线运行，零数据出境风险，无 Token 账单开销。",
        icon="🦙",
        docs_url="https://ollama.com",
        recommended_models=["llama3.3", "qwen2.5-coder", "deepseek-r1:14b", "mistral"],
    ),
    ProviderType.CUSTOM: ProviderPreset(
        provider_type=ProviderType.CUSTOM,
        display_name="OpenAI-Compatible 自定义中转",
        default_api_base="http://localhost:8000/v1",
        description="接入 OneAPI、NewAPI、vLLM、TGI 或任意私有聚合网关。",
        icon="🔌",
        docs_url="https://platform.openai.com/docs/api-reference",
        recommended_models=["custom-model-v1"],
    ),
}


def list_provider_presets() -> List[ProviderPreset]:
    return list(PROVIDER_PRESETS.values())
