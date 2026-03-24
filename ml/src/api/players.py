"""Player profile and embedding endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


@router.post("/player/build-profile")
async def build_player_profile(request: BuildProfileRequest) -> PlayerProfile:
    """Fetch a player's games and compute their style profile.

    This builds a player embedding from their game history.
    """
    from src.data.player_stats import compute_stats_from_pgns

    # Fetch games based on source
    pgn_texts = []

    if request.source == "lichess":
        from src.data.sources.lichess import fetch_player_games
        async for pgn in fetch_player_games(request.username, max_games=request.max_games):
            pgn_texts.append(pgn)
    elif request.source == "chesscom":
        from src.data.sources.chesscom import fetch_player_games
        async for pgn in fetch_player_games(request.username, max_games=request.max_games):
            pgn_texts.append(pgn)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown source: {request.source}")

    if not pgn_texts:
        raise HTTPException(status_code=404, detail=f"No games found for {request.username}")

    # Compute stats
    stats = compute_stats_from_pgns(pgn_texts, request.username)

    # Build style summary
    style_summary = {
        "aggression": round(stats.aggression_index * 100),
        "tactical": round(stats.tactical_tendency * 100),
        "accuracy": round(max(0, 100 - stats.avg_centipawn_loss)),
        "consistency": round(stats.consistency * 100),
        "opening_diversity": round(stats.opening_diversity * 100),
        "preferred_openings": {
            "e4": round(stats.e4_ratio * 100),
            "d4": round(stats.d4_ratio * 100),
            "other": round(stats.other_opening_ratio * 100),
        },
    }

    return PlayerProfile(
        username=request.username,
        source=request.source,
        rating=stats.rating,
        num_games=stats.num_games,
        stats={"vector": stats.to_vector().tolist()},
        style_summary=style_summary,
    )


@router.get("/player/{player_id}/stats")
async def get_player_stats(player_id: int):
    """Get computed statistics for a player by ID."""
    # This would look up from database in production
    return {"player_id": player_id, "status": "not_implemented"}
