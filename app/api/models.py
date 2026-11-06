"""
NEXUS CORE 2.1 — Model Hub API Endpoints.
Prefix: /api/models
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from app.model_hub.manager import model_hub_manager
from app.model_hub.providers import list_provider_presets
from app.model_hub.router import model_router
from app.model_hub.schemas import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    ModelConfig,
    ModelCreateRequest,
    ProviderPreset,
    ProviderType,
    RoutingPolicy,
)

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/providers", response_model=List[ProviderPreset])
def get_providers():
    """List all supported LLM providers and presets."""
    return list_provider_presets()


@router.get("", response_model=List[ModelConfig])
def get_models(
    provider: Optional[ProviderType] = None,
    enabled_only: bool = False,
):
    """List all configured models with masked credentials and capabilities."""
    return model_hub_manager.list_models(provider=provider, enabled_only=enabled_only)


@router.get("/{model_id}", response_model=ModelConfig)
def get_model(model_id: str):
    """Get single model configuration."""
    model = model_hub_manager.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return model


@router.post("", response_model=ModelConfig, status_code=201)
def add_model(req: ModelCreateRequest):
    """Register and save a new model configuration."""
    try:
        return model_hub_manager.add_model(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{model_id}", response_model=ModelConfig)
def update_model(model_id: str, updates: dict):
    """Update model settings (capabilities, pricing, enabled)."""
    try:
        return model_hub_manager.update_model(model_id, updates)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{model_id}")
def delete_model(model_id: str):
    """Remove a configured model."""
    try:
        model_hub_manager.delete_model(model_id)
        return {"ok": True, "message": f"Model '{model_id}' removed."}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/test-connection", response_model=ConnectionTestResponse)
def test_connection(req: ConnectionTestRequest):
    """Ping provider endpoint and verify API key authorization."""
    return model_hub_manager.test_connection(req)


@router.get("/routing/policy", response_model=RoutingPolicy)
def get_routing_policy():
    """Get current dynamic model routing policy."""
    return model_router.get_policy()


@router.post("/routing/policy", response_model=RoutingPolicy)
def update_routing_policy(policy: RoutingPolicy):
    """Update dynamic model routing policy."""
    return model_router.set_policy(policy)
