"""Player profile and embedding endpoints."""

import asyncio
import logging
from io import StringIO

import chess.pgn
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from src.data.opening_book import OpeningBook
from src.data.validation import validate_source, validate_username
from src.data.personal_explorer import PersonalExplorer
from src.db import cache as profile_cache
from src.inference.pipeline import prediction_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()

# Canonical time control names accepted by this API.
# "daily" is Chess.com's correspondence time class — a fundamentally
# different game from OTB classical (multi-day per move). We accept it
# as a first-class time control rather than aliasing classical → daily.
VALID_TIME_CONTROLS = {"bullet", "blitz", "rapid", "classical", "daily"}

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

    @field_validator("username")
    @classmethod
    def _username_safe(cls, v: str) -> str:
        return validate_username(v)

    @field_validator("source")
    @classmethod
    def _source_safe(cls, v: str) -> str:
        return validate_source(v)

    @field_validator("max_games")
    @classmethod
    def _max_games_bounded(cls, v: int) -> int:
        return max(1, min(v, 500))


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
    # PRD §5.2 / §4.4: the player's actual measured value on each of the
    # 10 style dimensions, projected to the same 0–100 slider scale. The
    # UI uses these as baseline tick marks under each slider so the user
    # can see how far they're pushing the simulation from the real player.
    baseline_style: dict[str, float] = {}


@router.post("/player/build-profile")
async def build_player_profile(request: BuildProfileRequest) -> PlayerProfile:
    """Fetch a player's games and compute their style profile.

    This builds a player embedding from their game history.
    Optionally filters by time control so the model plays like the person
    at that specific time control (e.g. their bullet vs rapid style).
    """
    # Validate time_control if provided
    if request.time_control and request.time_control not in VALID_TIME_CONTROLS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid time_control: {request.time_control}. "
                   f"Must be one of: {', '.join(sorted(VALID_TIME_CONTROLS))}",
        )

    # PRD §3.7: Chess.com's "daily" time class is correspondence chess
    # (multi-day per move), which is a fundamentally different game than
    # OTB classical. Don't silently alias the two — surface the gap.
    if request.source == "chesscom" and request.time_control == "classical":
        raise HTTPException(
            status_code=400,
            detail="Chess.com does not have a 'classical' time control. "
                   "Choose 'rapid' for slow online games, or 'daily' for "
                   "correspondence-style play.",
        )

    player_key = f"{request.source}:{request.username}".lower()

    # PRD §6.1: single-flight build lock. If a peer worker is already
    # building this same profile, wait for them and then return the
    # cached result rather than starting a duplicate PGN download.
    async with profile_cache.BuildLock(player_key) as acquired:
        if not acquired:
            arrived = await profile_cache.wait_for_build(player_key, max_wait_seconds=30)
            if arrived:
                hydrated = await profile_cache.hydrate_profile_into_pipeline(
                    player_key, prediction_pipeline
                )
                if hydrated:
                    return _profile_response_from_pipeline(player_key, request)
            # Lock holder failed or timed out — fall through and rebuild

        profile = await _do_build_profile(request, player_key)

    # Progressive clone enhancement: kick off the Phase 3 embedding
    # fine-tune in the background (~1 min) so the clone upgrades from
    # "repertoire" to "personalized" while the user is already playing.
    # No-op when no bracket checkpoint exists or a run is in flight.
    from src.api.personalize import auto_personalize

    asyncio.create_task(
        auto_personalize(player_key, request.source, request.username)
    )

    return profile


async def _do_build_profile(
    request: BuildProfileRequest, player_key: str
) -> PlayerProfile:
    """Inner build implementation. Caller holds the BuildLock."""
    from src.data.player_stats import compute_stats_from_pgns

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

    # PRD §5.3: Chess.com PGNs lack Lichess's [%eval] annotations, so
    # CPL / blunder stats would fall back to defaults. Run a lightweight
    # Stockfish annotation pass (~30 s) to inject real eval data before
    # computing stats. Lichess PGNs already carry evals — skip for them.
    if request.source == "chesscom":
        from src.data.player_stats import annotate_pgns_with_stockfish
        pgn_texts = await annotate_pgns_with_stockfish(
            pgn_texts, request.username, max_positions=400, depth=8
        )

    # Compute stats from games
    stats = compute_stats_from_pgns(pgn_texts, request.username)

    # PRD §4.1 #13 (Color-Specific Mode): also compute per-color stats when
    # there's enough signal per color. People really do play differently as
    # White vs Black; the pipeline auto-selects by side-to-move at predict
    # time. Fewer than 10 games with a color → fall back to combined.
    stats_by_color: dict[str, "np.ndarray"] = {}
    for color in ("white", "black"):
        color_stats = compute_stats_from_pgns(pgn_texts, request.username, color)
        if color_stats.num_games >= 10:
            stats_by_color[color[0]] = color_stats  # keyed "w"/"b"

    # Override PGN-derived rating with authoritative API rating
    if authoritative_rating is not None:
        stats.rating = authoritative_rating

    # Everything internal (bracket checkpoints, the stats vector's rating
    # slot, sampler schedules) is Lichess-denominated. Chess.com ratings
    # run a few hundred points lower at the same strength, so translate
    # before conditioning — the displayed rating stays the platform one.
    from src.data.rating_translation import to_internal_rating

    internal_rating = to_internal_rating(
        stats.rating, request.source, request.time_control
    )

    # Load the rating-bracket model checkpoint for this player's rating.
    # Async + locked: concurrent profile builds don't race-load the
    # MovePredictor singleton mid-inference for another request.
    await prediction_pipeline.load_model_for_rating_async(internal_rating)

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
    # PRD §5.3: build a position-keyed personal explorer for sources
    # without their own player-explorer API (Chess.com). For Lichess
    # players we still build it as a low-latency fallback when the
    # Lichess Player Explorer API is rate-limited or unreachable.
    personal_explorer = PersonalExplorer()
    for pgn_text in pgn_texts:
        try:
            game = chess.pgn.read_game(StringIO(pgn_text))
            if game is None:
                continue
            moves = [move.uci() for move in game.mainline_moves()]
            book.add_game(moves)
            personal_explorer.add_game(pgn_text, request.username)
        except Exception:
            continue

    # Register the book, stats, and time control with the prediction pipeline.
    # `player_key` was computed by the caller (build_player_profile) and is
    # already lowercased — reuse the same value so cache keys line up.
    stats_vector = stats.to_vector()
    # Rating slot conditions the model — must be on the internal scale.
    # The platform-facing number is kept separately for display.
    stats_vector[0] = internal_rating / 3000.0
    prediction_pipeline.player_display_ratings[player_key] = float(stats.rating)

    # Per-color vectors (same internal-rating normalization).
    color_vectors: dict[str, "np.ndarray"] = {}
    for c, cstats in stats_by_color.items():
        v = cstats.to_vector()
        v[0] = internal_rating / 3000.0
        color_vectors[c] = v
    if color_vectors:
        prediction_pipeline.set_player_stats_by_color(player_key, color_vectors)

    prediction_pipeline.set_opening_book(player_key, book)
    prediction_pipeline.set_player_stats(player_key, stats_vector)
    prediction_pipeline.set_player_time_control(player_key, request.time_control)
    prediction_pipeline.set_personal_explorer(player_key, personal_explorer)

    # PRD §6.1 + §5.3: write-through to Redis so the profile survives ML
    # restarts and is visible to peer workers, including the personal
    # explorer index for Chess.com / fallback use.
    await profile_cache.save_profile(
        player_key,
        stats_vector=stats_vector,
        opening_book=book,
        time_control=request.time_control,
        rating=stats.rating,
        num_games=stats.num_games,
        personal_explorer=personal_explorer,
        stats_by_color=color_vectors or None,
    )

    logger.info(
        "Built opening book for %s: %d games, %d nodes, time_control=%s",
        player_key, book.total_games, book.size, request.time_control,
    )

    baseline_style = _derive_baseline_style(stats)

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
        baseline_style=baseline_style,
    )


def _derive_baseline_style(stats) -> dict[str, float]:
    """Project the 33-dim PlayerStats vector onto the 10 user-facing
    slider values (0–100). Used by the UI to render a baseline tick mark
    under each slider. See PRD §5.2 / §4.4.

    Mapping is deliberately simple — non-linear if and only if a linear
    map would be misleading. Each output is clamped to [0, 100].
    """

    def clamp(v: float) -> float:
        return float(max(0.0, min(100.0, v)))

    # Aggression: existing aggression_index already 0–1.
    aggression = stats.aggression_index * 100.0

    # Risk-taking: blend eval volatility (sharp games) with low consistency
    # (variance in style). Both contribute.
    risk_taking = (stats.eval_volatility * 60.0) + ((1.0 - stats.consistency) * 40.0)

    # Blunder frequency: blunder_rate is already a fraction. Calibrate so
    # ~5% (avg amateur) lands at ~50; ~20% lands at ~95.
    blunder_frequency = min(stats.blunder_rate * 400.0, 100.0)

    king_attack = stats.king_attack_intensity * 100.0
    # Positional 50=neutral; > 50 = more quiet moves than typical.
    # Typical quiet ratio at all levels is ~0.6; map 0.6 → 50.
    positional = clamp((stats.quiet_move_ratio - 0.6) * 200.0 + 50.0)
    trade_preference = stats.capture_initiation_rate * 100.0

    # Opening loyalty: low diversity → high loyalty.
    opening_loyalty = (1.0 - stats.opening_diversity) * 100.0
    repertoire_width = stats.opening_diversity * 100.0

    # Endgame strength: invert endgame CPL. 0 cpl → 100, 100+ cpl → 0.
    endgame_strength = clamp(100.0 - stats.endgame_cpl)

    # Defensive tenacity: rough proxy = win rate when down material,
    # which we don't track directly. Use 100 - (eval_volatility * 50) as
    # a crude floor: drifty players have low tenacity.
    defensive_tenacity = clamp(80.0 - stats.eval_volatility * 60.0)

    # PRD §4.1 #11: storm-push rate ~0.08 is typical → maps to 50.
    pawn_aggression = clamp(stats.pawn_aggression * 600.0)

    return {
        "aggression": clamp(aggression),
        "risk_taking": clamp(risk_taking),
        "blunder_frequency": clamp(blunder_frequency),
        "king_attack": clamp(king_attack),
        "positional": clamp(positional),
        "trade_preference": clamp(trade_preference),
        "opening_loyalty": clamp(opening_loyalty),
        "repertoire_width": clamp(repertoire_width),
        "endgame_strength": clamp(endgame_strength),
        "defensive_tenacity": clamp(defensive_tenacity),
        "pawn_aggression": pawn_aggression,
    }


def _profile_response_from_pipeline(
    player_key: str, request: BuildProfileRequest
) -> PlayerProfile:
    """Reconstruct a PlayerProfile response from the in-memory pipeline state.

    Used when a concurrent peer worker built the profile and we hydrated it
    from Redis after the build lock was released.
    """
    stats_vec = prediction_pipeline.player_stats.get(player_key)
    book = prediction_pipeline.opening_books.get(player_key)
    if stats_vec is None or book is None:
        # Hydration claimed success but state is missing — refuse so the
        # caller can fall through and rebuild.
        raise HTTPException(status_code=503, detail="Profile cache inconsistent; please retry")

    # Prefer the platform-facing rating; stats_vec[0] is the internal
    # (Lichess-scale) rating, which differs for Chess.com players.
    rating = prediction_pipeline.player_display_ratings.get(
        player_key, float(stats_vec[0]) * 3000.0
    )
    return PlayerProfile(
        username=request.username,
        source=request.source,
        rating=rating,
        num_games=int(min(stats_vec[1] * 1000.0, 1000)),
        stats={"vector": stats_vec.tolist()},
        style_summary={
            "aggression": round(float(stats_vec[4]) * 100),
            "tactical": round(float(stats_vec[5]) * 100),
            "accuracy": -1,
            "consistency": round(float(stats_vec[10]) * 100),
            "opening_diversity": round(float(stats_vec[6]) * 100),
            "preferred_openings": {
                "e4": round(float(stats_vec[14]) * 100),
                "d4": round(float(stats_vec[15]) * 100),
                "other": round(float(stats_vec[16]) * 100),
            },
        },
        player_key=player_key,
        opening_book_size=book.size,
        preparation_steps=["hydrated_from_cache"],
        ratings_by_time_control={},
        selected_time_control=request.time_control,
    )


@router.get("/player/profile/{player_key:path}")
async def get_cached_profile(player_key: str):
    """Lightweight preflight: is this profile still cached on the ML side?

    The frontend persists `player_key` across refreshes (PRD §6.1) and calls
    this on app load to decide whether the previously-selected opponent is
    still usable. If we return `cached: true`, the next /ml/predict will
    transparently rehydrate from Redis on first miss.
    """
    key = player_key.lower()
    in_memory = key in prediction_pipeline.player_stats
    in_redis = False if in_memory else await profile_cache.profile_exists(key)
    return {
        "player_key": key,
        "cached": in_memory or in_redis,
        "location": "memory" if in_memory else ("redis" if in_redis else "none"),
    }


@router.get("/player/clone-status/{player_key:path}")
async def get_clone_status(player_key: str):
    """Progressive clone-fidelity status for the frontend badge.

    Stages:
      generic      — no profile artifacts loaded; bracket model + defaults
      repertoire   — opening book / personal explorer / stats are active
      personalized — a Phase 3 fine-tuned embedding row is serving
    """
    from src.api.personalize import get_personalize_status, load_personalization

    key = player_key.lower()

    # Rehydrate from Redis if this worker hasn't seen the player yet, so
    # the badge survives ML restarts just like predictions do.
    if key not in prediction_pipeline.player_stats:
        await profile_cache.hydrate_profile_into_pipeline(key, prediction_pipeline)

    has_stats = key in prediction_pipeline.player_stats
    book = prediction_pipeline.opening_books.get(key)
    explorer = prediction_pipeline.personal_explorers.get(key)

    personalization = prediction_pipeline.get_personalization(key)
    if personalization is None:
        cached = await load_personalization(key)
        if cached is not None:
            emb, pid = cached
            prediction_pipeline.set_personalization(key, emb, pid)
            personalization = cached

    p_status = get_personalize_status(key)
    if personalization is not None:
        p_state = "ready"
    else:
        p_state = p_status["status"]  # none | running | failed

    if personalization is not None:
        stage = "personalized"
    elif has_stats or book is not None or explorer is not None:
        stage = "repertoire"
    else:
        stage = "generic"

    return {
        "player_key": key,
        "stage": stage,
        "profile_loaded": has_stats,
        "opening_book": {
            "loaded": book is not None,
            "games": book.total_games if book is not None else 0,
        },
        "personal_explorer": {
            "loaded": explorer is not None,
            "positions": explorer.size if explorer is not None else 0,
        },
        "personalization": {
            "status": p_state,
            "error": p_status.get("error"),
        },
    }


@router.get("/player/{player_id}/stats")
async def get_player_stats(player_id: int):
    """Get computed statistics for a player by ID."""
    # This would look up from database in production
    return {"player_id": player_id, "status": "not_implemented"}
