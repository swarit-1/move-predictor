"""Health check endpoint."""

import torch
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Return service health status including GPU and model availability."""
    from src.inference.pipeline import prediction_pipeline

    if torch.cuda.is_available():
        gpu_available = True
        gpu_name = torch.cuda.get_device_name(0)
        device = "cuda"
    elif torch.backends.mps.is_available():
        gpu_available = True
        gpu_name = "Apple Silicon (MPS)"
        device = "mps"
    else:
        gpu_available = False
        gpu_name = None
        device = "cpu"

    return {
        "status": "healthy",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "device": device,
        # Which trained checkpoint (if any) is currently serving predictions.
        "has_checkpoint": prediction_pipeline.has_checkpoint,
        "checkpoint": prediction_pipeline._loaded_checkpoint_path,
        "checkpoint_phase": prediction_pipeline.checkpoint_phase,
    }
