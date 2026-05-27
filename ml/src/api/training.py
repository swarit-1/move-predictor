"""Training job management endpoints.

PRD §3.12: previously, `POST /ml/training/start` returned a job_id and
status="queued" without actually doing anything — a caller hitting this
endpoint would conclude that training had started when in fact nothing
happened. That's worse than no endpoint at all. Until the real job
queue (Celery / RQ) lands as part of PRD §5.4, both endpoints return
501 Not Implemented and a pointer to the offline `scripts/train.py`
entry point that actually runs a training pass.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TrainRequest(BaseModel):
    phase: int = 1  # 1, 2, or 3
    data_path: str = "data/processed/train.h5"
    val_path: str = "data/processed/val.h5"
    num_epochs: int = 20
    batch_size: int = 1024
    learning_rate: float = 1e-3


@router.post("/training/start")
async def start_training(request: TrainRequest):  # noqa: ARG001
    raise HTTPException(
        status_code=501,
        detail=(
            "Online training is not implemented. Run "
            "`python scripts/train.py --phase {phase} --data {data_path}` "
            "from the ml/ directory, or invoke "
            "`scripts/train_all_brackets.sh` for the full bracket sweep. "
            "Job queue support is tracked in PRD §5.4."
        ),
    )


@router.get("/training/{job_id}")
async def get_training_status(job_id: str):  # noqa: ARG001
    raise HTTPException(
        status_code=501,
        detail="Online training status is not implemented. See PRD §5.4.",
    )
