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
    # Which site's scale `player_rating` is on: "lichess" (default) or
    # "chesscom". Everything internal is Lichess-denominated, so Chess.com
    # ratings are translated on the way in (see data/rating_translation.py).
    rating_pool: str | None = None
    player_key: str | None = None  # source:username for opening book lookup
    style_overrides: dict | None = None  # {aggression, risk_taking, blunder_frequency}
    time_remaining: float | None = None  # seconds left on opponent's clock
    time_control_initial: float | None = None  # initial time in seconds


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

    # Normalize the rating to the internal (Lichess) scale. The time class
    # for the translation curve is inferred from the game's time control.
    from src.data.rating_translation import to_internal_rating

    time_class = None
    if request.time_control_initial:
        secs = request.time_control_initial
        time_class = "bullet" if secs < 180 else "blitz" if secs < 600 else "rapid"
    internal_rating = to_internal_rating(
        request.player_rating, request.rating_pool, time_class
    )

    if board.is_game_over():
        raise HTTPException(status_code=400, detail="Game is already over")

    # Parse style overrides. PRD §5.2: 10 dimensions total; older callers
    # may only send the original 3. Anything missing falls back to the
    # neutral midpoint of 50.
    style = None
    if request.style_overrides:
        ov = request.style_overrides
        style = StyleOverrides(
            aggression=ov.get("aggression", 50.0),
            risk_taking=ov.get("risk_taking", 50.0),
            blunder_frequency=ov.get("blunder_frequency", 50.0),
            king_attack=ov.get("king_attack", 50.0),
            positional=ov.get("positional", 50.0),
            trade_preference=ov.get("trade_preference", 50.0),
            opening_loyalty=ov.get("opening_loyalty", 50.0),
            repertoire_width=ov.get("repertoire_width", 50.0),
            endgame_strength=ov.get("endgame_strength", 50.0),
            defensive_tenacity=ov.get("defensive_tenacity", 50.0),
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

    # Compute time pressure (0.0 = no pressure, 1.0 = extreme pressure)
    time_pressure = 0.0
    if request.time_remaining is not None and request.time_control_initial:
        ratio = request.time_remaining / request.time_control_initial
        if ratio < 0.1:
            time_pressure = 1.0
        elif ratio < 0.25:
            time_pressure = 0.6
        elif ratio < 0.5:
            time_pressure = 0.2

    # Run prediction (async — queries Lichess explorer when no checkpoint)
    try:
        result = await prediction_pipeline.predict(
            fen=request.fen,
            move_history=request.move_history,
            player_id=request.player_id,
            player_rating=internal_rating,
            style=style,
            engine_top_moves=engine_top_moves,
            player_key=request.player_key,
            time_pressure=time_pressure,
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
            player_rating=internal_rating,
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
