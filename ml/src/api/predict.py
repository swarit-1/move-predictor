"""Move prediction endpoint."""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class PredictRequest(BaseModel):
    fen: str
    move_history: list[str] = []
    player_id: int = 0
    player_rating: float = 1500.0
    player_key: str | None = None  # source:username for opening book lookup
    style_overrides: dict | None = None  # {aggression, risk_taking, blunder_frequency}


class PredictResponse(BaseModel):
    move: str
    probability: float
    temperature: float
    top_moves: list[dict]
    predicted_cpl: float
    blunder_probability: float
    engine_best: str | None = None
    engine_top_moves: list[dict] = []
    explanation: dict | None = None


@router.post("/predict")
async def predict_move(request: PredictRequest) -> PredictResponse:
    """Predict the most likely human move for a position.

    Uses the neural network model with skill-aware sampling to generate
    a realistic human move prediction.
    """
    import chess
    from src.inference.pipeline import prediction_pipeline
    from src.inference.sampler import StyleOverrides
    from src.engine.stockfish_pool import stockfish_pool
    from src.inference.explainability import explain_prediction
    from src.data.preprocessing import classify_game_phase

    # Validate FEN
    try:
        board = chess.Board(request.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {request.fen}")

    if board.is_game_over():
        raise HTTPException(status_code=400, detail="Game is already over")

    # Parse style overrides
    style = None
    if request.style_overrides:
        style = StyleOverrides(
            aggression=request.style_overrides.get("aggression", 50.0),
            risk_taking=request.style_overrides.get("risk_taking", 50.0),
            blunder_frequency=request.style_overrides.get("blunder_frequency", 50.0),
        )

    # Get Stockfish analysis for comparison (non-blocking)
    engine_top_moves = []
    engine_best = None
    try:
        loop = asyncio.get_event_loop()
        analysis = await loop.run_in_executor(
            None, lambda: stockfish_pool.analyze_sync(request.fen, num_lines=5)
        )
        engine_best = analysis.best_move
        engine_top_moves = analysis.top_moves
    except Exception:
        pass  # Stockfish unavailable — proceed without engine comparison

    # Run prediction
    try:
        result = prediction_pipeline.predict(
            fen=request.fen,
            move_history=request.move_history,
            player_id=request.player_id,
            player_rating=request.player_rating,
            style=style,
            engine_top_moves=engine_top_moves,
            player_key=request.player_key,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Generate explanation
    explanation = None
    if engine_best:
        game_phase = classify_game_phase(board)
        expl = explain_prediction(
            sampled=result,
            engine_best_move=engine_best,
            engine_top_moves=engine_top_moves,
            player_rating=request.player_rating,
            game_phase=game_phase,
        )
        explanation = {
            "is_deviation": expl.is_deviation,
            "deviation_reason": expl.deviation_reason,
            "engine_rank": expl.engine_rank_of_model_move,
            "centipawn_cost": expl.centipawn_cost,
            "factors": expl.factors,
        }

    return PredictResponse(
        move=result.move_uci,
        probability=result.probability,
        temperature=result.temperature,
        top_moves=result.top_moves,
        predicted_cpl=result.predicted_cpl,
        blunder_probability=result.blunder_probability,
        engine_best=engine_best,
        engine_top_moves=engine_top_moves,
        explanation=explanation,
    )
