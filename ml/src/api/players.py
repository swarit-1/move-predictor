"""Player profile and embedding endpoints."""

import logging
from io import StringIO

import chess.pgn
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.data.opening_book import OpeningBook
from src.inference.pipeline import prediction_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()


class BuildProfileRequest(BaseModel):
    source: str  # "lichess" or "chesscom"
    username: str
    max_games: int = 200


class PlayerProfile(BaseModel):
    username: str
    source: str
    rating: float
    num_games: int
    stats: dict
    style_summary: dict
    player_key: str | None = None
    opening_book_size: int = 0
    preparation_steps: list[str] = []


@router.post("/player/build-profile")
async def build_player_profile(request: BuildProfileRequest) -> PlayerProfile:
    """Fetch a player's games and compute their style profile.

    This builds a player embedding from their game history.
    """
    from src.data.player_stats import compute_stats_from_pgns

    # Get authoritative rating from profile API FIRST
    authoritative_rating: float | None = None
    pgn_texts: list[str] = []

    if request.source == "lichess":
        from src.data.sources.lichess import fetch_player_profile, fetch_player_games

        try:
            profile = await fetch_player_profile(request.username)
            perfs = profile.get("perfs", {})
            for game_type in ["blitz", "rapid", "classical", "bullet"]:
                if game_type in perfs and "rating" in perfs[game_type]:
                    authoritative_rating = float(perfs[game_type]["rating"])
                    break
        except Exception as e:
            logger.warning("Failed to fetch Lichess profile for %s: %s", request.username, e)

        async for pgn in fetch_player_games(request.username, max_games=request.max_games):
            pgn_texts.append(pgn)

    elif request.source == "chesscom":
        from src.data.sources.chesscom import fetch_player_stats, fetch_player_games

        try:
            chess_stats = await fetch_player_stats(request.username)
            for game_type in ["chess_blitz", "chess_rapid", "chess_bullet", "chess_daily"]:
                if game_type in chess_stats:
                    rating_data = chess_stats[game_type].get("last", {})
                    if "rating" in rating_data:
                        authoritative_rating = float(rating_data["rating"])
                        break
        except Exception as e:
            logger.warning("Failed to fetch Chess.com stats for %s: %s", request.username, e)

        async for pgn in fetch_player_games(request.username, max_games=request.max_games):
            pgn_texts.append(pgn)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown source: {request.source}")

    if not pgn_texts:
        raise HTTPException(status_code=404, detail=f"No games found for {request.username}")

    # Compute stats from games
    stats = compute_stats_from_pgns(pgn_texts, request.username)

    # Override PGN-derived rating with authoritative API rating
    if authoritative_rating is not None:
        stats.rating = authoritative_rating

    # Build style summary
    # Accuracy requires Stockfish analysis — mark as -1 when using default CPL
    accuracy = (
        round(max(0, 100 - stats.avg_centipawn_loss))
        if stats.avg_centipawn_loss != 50.0
        else -1
    )
    style_summary = {
        "aggression": round(stats.aggression_index * 100),
        "tactical": round(stats.tactical_tendency * 100),
        "accuracy": accuracy,
        "consistency": round(stats.consistency * 100),
        "opening_diversity": round(stats.opening_diversity * 100),
        "preferred_openings": {
            "e4": round(stats.e4_ratio * 100),
            "d4": round(stats.d4_ratio * 100),
            "other": round(stats.other_opening_ratio * 100),
        },
    }

    # Build opening book from the fetched games
    book = OpeningBook()
    for pgn_text in pgn_texts:
        try:
            game = chess.pgn.read_game(StringIO(pgn_text))
            if game is None:
                continue
            moves = [move.uci() for move in game.mainline_moves()]
            book.add_game(moves)
        except Exception:
            continue

    # Register the book with the prediction pipeline
    player_key = f"{request.source}:{request.username}".lower()
    prediction_pipeline.set_opening_book(player_key, book)
    logger.info(
        "Built opening book for %s: %d games, %d nodes",
        player_key, book.total_games, book.size,
    )

    return PlayerProfile(
        username=request.username,
        source=request.source,
        rating=stats.rating,
        num_games=stats.num_games,
        stats={"vector": stats.to_vector().tolist()},
        style_summary=style_summary,
        player_key=player_key,
        opening_book_size=book.size,
        preparation_steps=[
            "fetched_games",
            "built_opening_book",
            "computed_stats",
        ],
    )


@router.get("/player/{player_id}/stats")
async def get_player_stats(player_id: int):
    """Get computed statistics for a player by ID."""
    # This would look up from database in production
    return {"player_id": player_id, "status": "not_implemented"}
