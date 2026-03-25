"""Stockfish analysis endpoint."""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class AnalyzeRequest(BaseModel):
    fen: str
    depth: int = 18
    num_lines: int = 5


class AnalyzeResponse(BaseModel):
    best_move: str
    eval_cp: int | None
    eval_mate: int | None
    top_moves: list[dict]
    depth: int


@router.post("/analyze")
async def analyze_position(request: AnalyzeRequest) -> AnalyzeResponse:
    """Analyze a position using Stockfish."""
    import chess
    from src.engine.stockfish_pool import stockfish_pool

    # Validate FEN
    try:
        chess.Board(request.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {request.fen}")

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: stockfish_pool.analyze_sync(
                fen=request.fen,
                depth=request.depth,
                num_lines=request.num_lines,
            ),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"Stockfish unavailable: {e}")

    return AnalyzeResponse(
        best_move=result.best_move,
        eval_cp=result.eval_cp,
        eval_mate=result.eval_mate,
        top_moves=result.top_moves,
        depth=result.depth,
    )
