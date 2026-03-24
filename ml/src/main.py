"""FastAPI application entrypoint for the ML service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.health import router as health_router
from src.api.predict import router as predict_router
from src.api.analyze import router as analyze_router
from src.api.players import router as players_router
from src.api.training import router as training_router


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

app.include_router(health_router, prefix="/ml")
app.include_router(predict_router, prefix="/ml")
app.include_router(analyze_router, prefix="/ml")
app.include_router(players_router, prefix="/ml")
app.include_router(training_router, prefix="/ml")
