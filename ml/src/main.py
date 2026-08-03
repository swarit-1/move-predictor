"""FastAPI application entrypoint for the ML service."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

# Uvicorn only configures its own loggers; without this, every INFO line
# from src.* (checkpoint loads, pipeline sources, auto-personalize) is
# silently dropped.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from src.api.health import router as health_router
from src.api.predict import router as predict_router
from src.api.analyze import router as analyze_router
from src.api.players import router as players_router
from src.api.training import router as training_router
from src.api.review import router as review_router
from src.api.personalize import router as personalize_router
from src.api.coach import router as coach_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup, clean up on shutdown."""
    # Startup: load model, init Stockfish pool
    from src.engine.stockfish_pool import stockfish_pool
    from src.inference.pipeline import prediction_pipeline

    stockfish_pool.start()
    prediction_pipeline.load_model()

    yield

    # Shutdown: clean up
    stockfish_pool.shutdown()


app = FastAPI(
    title="Move Predictor ML Service",
    description="Human-aware chess move prediction using deep learning",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def require_internal_key(request, call_next):
    """PLAN.md S2: when ML_INTERNAL_KEY is configured, every request must
    carry it. The gateway is the only legitimate client; health stays open
    for infra probes."""
    from fastapi.responses import JSONResponse
    from src.config import settings

    if settings.ml_internal_key and request.url.path != "/ml/health":
        import hmac

        provided = request.headers.get("x-internal-key", "")
        if not hmac.compare_digest(provided, settings.ml_internal_key):
            return JSONResponse(status_code=401, content={"detail": "unauthorized"})
    return await call_next(request)

app.include_router(health_router, prefix="/ml")
app.include_router(predict_router, prefix="/ml")
app.include_router(analyze_router, prefix="/ml")
app.include_router(players_router, prefix="/ml")
app.include_router(training_router, prefix="/ml")
app.include_router(review_router, prefix="/ml")
app.include_router(personalize_router, prefix="/ml")
app.include_router(coach_router, prefix="/ml")
