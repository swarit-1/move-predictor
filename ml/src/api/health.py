"""Health check endpoint."""

import torch
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Return service health status including GPU and model availability."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return {
        "status": "healthy",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "device": "cuda" if gpu_available else "cpu",
    }
