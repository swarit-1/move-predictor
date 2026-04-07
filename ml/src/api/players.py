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

# Canonical time control names accepted by this API
VALID_TIME_CONTROLS = {"bullet", "blitz", "rapid", "classical"}

# Maps our canonical names to Lichess perf type keys
LICHESS_PERF_MAP = {
    "bullet": "bullet",
    "blitz": "blitz",
    "rapid": "rapid",
    "classical": "classical",
}


class BuildProfileRequest(BaseModel):
    source: str  # "lichess" or "chesscom"
    username: str
    max_games: int = 200
    time_control: str | None = None  # "bullet", "blitz", "rapid", "classical"


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
    ratings_by_time_control: dict[str, float | None] = {}
    selected_time_control: str | None = None


@router.post("/player/build-profile")
async def build_player_profile(request: BuildProfileRequest) -> PlayerProfile:
    """Fetch a player's games and compute their style profile.

    This builds a player embedding from their game history.
    Optionally filters by time control so the model plays like the person
    at that specific time control (e.g. their bullet vs rapid style).
    """
    from src.data.player_stats import compute_stats_from_pgns

    # Validate time_control if provided
    if request.time_control and request.time_control not in VALID_TIME_CONTROLS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid time_control: {request.time_control}. "
                   f"Must be one of: {', '.join(sorted(VALID_TIME_CONTROLS))}",
        )

    authoritative_rating: float | None = None
    ratings_by_tc: dict[str, float | None] = {}
    pgn_texts: list[str] = []

    if request.source == "lichess":
        from src.data.sources.lichess import fetch_player_profile, fetch_player_games

        try:
            profile = await fetch_player_profile(request.username)
            perfs = profile.get("perfs", {})

            # Collect all available ratings
            for tc in VALID_TIME_CONTROLS:
                lichess_key = LICHESS_PERF_MAP[tc]
                if lichess_key in perfs and "rating" in perfs[lichess_key]:
                    ratings_by_tc[tc] = float(perfs[lichess_key]["rating"])

            # Pick the authoritative rating: use requested TC if specified
            if request.time_control and request.time_control in ratings_by_tc:
                authoritative_rating = ratings_by_tc[request.time_control]
            else:
                # Fallback priority: blitz > rapid > classical > bullet
                for tc in ["blitz", "rapid", "classical", "bullet"]:
                    if tc in ratings_by_tc and ratings_by_tc[tc] is not None:
                        authoritative_rating = ratings_by_tc[tc]
                        break
        except Exception as e:
            logger.warning("Failed to fetch Lichess profile for %s: %s", request.username, e)

        # Filter games by time control if specified
        perf_type = LICHESS_PERF_MAP.get(request.time_control) if request.time_control else None
        async for pgn in fetch_player_games(
            request.username,
            max_games=request.max_games,
            perf_type=perf_type,
        ):
            pgn_texts.append(pgn)

    elif request.source == "chesscom":
        from src.data.sources.chesscom import (
            fetch_player_stats,
            fetch_player_games,
            fetch_all_ratings,
        )

        try:
            ratings_by_tc = await fetch_all_ratings(request.username)

            # Pick the authoritative rating: use requested TC if specified
            if request.time_control and request.time_control in ratings_by_tc:
                authoritative_rating = ratings_by_tc[request.time_control]
            else:
                for tc in ["blitz", "rapid", "bullet", "daily"]:
                    if tc in ratings_by_tc and ratings_by_tc[tc] is not None:
                        authoritative_rating = ratings_by_tc[tc]
                        break
        except Exception as e:
            logger.warning("Failed to fetch Chess.com stats for %s: %s", request.username, e)

        # Filter games by time control if specified
        time_class = request.time_control if request.time_control else None
        async for pgn in fetch_player_games(
            request.username,
            max_games=request.max_games,
            time_class=time_class,
        ):
            pgn_texts.append(pgn)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown source: {request.source}")

    if not pgn_texts:
        tc_msg = f" for time control '{request.time_control}'" if request.time_control else ""
        raise HTTPException(
            status_code=404,
            detail=f"No games found for {request.username}{tc_msg}",
        )

    # Compute stats from games
    stats = compute_stats_from_pgns(pgn_texts, request.username)

    # Override PGN-derived rating with authoritative API rating
    if authoritative_rating is not None:
        stats.rating = authoritative_rating

    # Load the rating-bracket model checkpoint for this player's rating
    prediction_pipeline.load_model_for_rating(stats.rating)

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

    # Register the book, stats, and time control with the prediction pipeline
    player_key = f"{request.source}:{request.username}".lower()
    prediction_pipeline.set_opening_book(player_key, book)
    prediction_pipeline.set_player_stats(player_key, stats.to_vector())
    prediction_pipeline.set_player_time_control(player_key, request.time_control)
    logger.info(
        "Built opening book for %s: %d games, %d nodes, time_control=%s",
        player_key, book.total_games, book.size, request.time_control,
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
        ratings_by_time_control=ratings_by_tc,
        selected_time_control=request.time_control,
    )


@router.get("/player/{player_id}/stats")
async def get_player_stats(player_id: int):
    """Get computed statistics for a player by ID."""
    # This would look up from database in production
    return {"player_id": player_id, "status": "not_implemented"}
