"""Training job management endpoints."""

import uuid
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# In-memory job tracking (production would use a database)
_jobs: dict[str, dict] = {}


class TrainRequest(BaseModel):
    phase: int = 1  # 1, 2, or 3
    data_path: str = "data/processed/train.h5"
    val_path: str = "data/processed/val.h5"
    num_epochs: int = 20
    batch_size: int = 1024
    learning_rate: float = 1e-3


class TrainResponse(BaseModel):
    job_id: str
    status: str
    message: str


@router.post("/training/start")
async def start_training(request: TrainRequest) -> TrainResponse:
    """Trigger a training job.

    In production, this would submit to a task queue (Celery/RQ).
    For now, it records the job and returns immediately.
    """
    job_id = str(uuid.uuid4())[:8]

    _jobs[job_id] = {
        "status": "queued",
        "phase": request.phase,
        "config": request.model_dump(),
    }

    return TrainResponse(
        job_id=job_id,
        status="queued",
        message=f"Phase {request.phase} training job queued. "
        f"Use GET /ml/training/{job_id} to check status.",
    )


@router.get("/training/{job_id}")
async def get_training_status(job_id: str):
    """Get the status of a training job."""
    if job_id not in _jobs:
        return {"error": "Job not found", "job_id": job_id}
    return {"job_id": job_id, **_jobs[job_id]}
