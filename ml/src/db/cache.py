"""Redis-backed cache for built player profiles.

PRD §3.1 / §5.1 / §6.1: previously, `prediction_pipeline.opening_books`,
`player_stats`, and `player_time_controls` only lived in process memory.
Any ML restart, scale-out, or browser refresh lost every selected
opponent. This module mirrors profile data into Redis so that:

  - A refreshed frontend can rehydrate by sending its persisted
    `player_key` back; the predict pipeline transparently pulls the
    profile from Redis when the in-memory entry is cold.
  - A second uvicorn worker (or a restarted one) sees the same profiles.
  - A `build_player_profile` already in flight for the same username
    short-circuits to the in-flight build rather than starting a second
    PGN download.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import numpy as np
import redis.asyncio as aioredis

from src.config import settings
from src.data.opening_book import OpeningBook
from src.data.personal_explorer import PersonalExplorer

logger = logging.getLogger(__name__)

PROFILE_KEY_PREFIX = "profile:"
PROFILE_LOCK_PREFIX = "profile:lock:"
PROFILE_TTL_SECONDS = 24 * 60 * 60  # 24 h
LOCK_TTL_SECONDS = 60  # build lock auto-expires; long enough for ~5k games

_client: aioredis.Redis | None = None
_client_lock = asyncio.Lock()


async def _get_client() -> aioredis.Redis | None:
    """Return a process-wide Redis client. None if Redis is unreachable.

    Cache is treated as best-effort: any failure returns None and the
    caller falls through to the slower path.
    """
    global _client
    if _client is not None:
        return _client
    async with _client_lock:
        if _client is not None:
            return _client
        try:
            client = aioredis.from_url(
                settings.redis_url,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
                decode_responses=False,
            )
            # Eager ping so we fail closed on the first call, not on every read
            await client.ping()
            _client = client
            logger.info("Redis profile cache connected at %s", settings.redis_url)
            return _client
        except Exception as e:
            logger.warning("Redis profile cache unavailable: %s", e)
            return None


def _profile_key(player_key: str) -> str:
    return f"{PROFILE_KEY_PREFIX}{player_key.lower()}"


def _lock_key(player_key: str) -> str:
    return f"{PROFILE_LOCK_PREFIX}{player_key.lower()}"


# ── Profile persistence ────────────────────────────────────────────────


async def save_profile(
    player_key: str,
    *,
    stats_vector: np.ndarray,
    opening_book: OpeningBook,
    time_control: str | None,
    rating: float,
    num_games: int,
    personal_explorer: PersonalExplorer | None = None,
    stats_by_color: dict[str, np.ndarray] | None = None,
) -> None:
    """Write a built profile to Redis. Best-effort: failures are logged and swallowed."""
    client = await _get_client()
    if client is None:
        return
    payload = {
        "stats": stats_vector.tolist(),
        "book": opening_book.to_dict(),
        "time_control": time_control,
        "rating": float(rating),
        "num_games": int(num_games),
    }
    if personal_explorer is not None:
        payload["personal_explorer"] = personal_explorer.to_dict()
    # PRD §4.1 #13: per-color stats vectors ("w"/"b" keys)
    if stats_by_color:
        payload["stats_by_color"] = {
            c: v.tolist() for c, v in stats_by_color.items()
        }
    try:
        await client.setex(
            _profile_key(player_key),
            PROFILE_TTL_SECONDS,
            json.dumps(payload).encode("utf-8"),
        )
        logger.info("Cached profile for %s in Redis", player_key)
    except Exception as e:
        logger.warning("Failed to cache profile for %s: %s", player_key, e)


async def load_profile(player_key: str) -> dict[str, Any] | None:
    """Return the cached profile dict, or None if not cached."""
    client = await _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(_profile_key(player_key))
    except Exception as e:
        logger.warning("Failed to read profile cache for %s: %s", player_key, e)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as e:
        logger.warning("Corrupt profile cache for %s: %s", player_key, e)
        return None


async def hydrate_profile_into_pipeline(player_key: str, pipeline) -> bool:
    """Pull a cached profile from Redis into the in-process prediction pipeline.

    Returns True on hydration, False otherwise.
    """
    cached = await load_profile(player_key)
    if cached is None:
        return False
    try:
        stats = np.asarray(cached["stats"], dtype=np.float32)
        book = OpeningBook.from_dict(cached["book"])
        tc = cached.get("time_control")
        pipeline.set_opening_book(player_key, book)
        pipeline.set_player_stats(player_key, stats)
        by_color = cached.get("stats_by_color")
        if by_color:
            pipeline.set_player_stats_by_color(
                player_key,
                {c: np.array(v, dtype=np.float32) for c, v in by_color.items()},
            )
        pipeline.set_player_time_control(player_key, tc)
        # PRD §5.3: rehydrate the personal explorer if the cached
        # profile carries one (newer cache writes do; legacy entries
        # written before this feature shipped won't).
        pe_payload = cached.get("personal_explorer")
        if pe_payload:
            pe = PersonalExplorer.from_dict(pe_payload)
            pipeline.set_personal_explorer(player_key, pe)
        rating = cached.get("rating")
        if rating is not None:
            pipeline.player_display_ratings[player_key] = float(rating)
            # The cached rating is platform-facing; bracket selection is
            # Lichess-denominated. The pool is the player_key's prefix.
            from src.data.rating_translation import to_internal_rating

            pool = player_key.split(":", 1)[0]
            tc_id = cached.get("time_control")
            pipeline.load_model_for_rating(
                to_internal_rating(float(rating), pool, tc_id)
            )
        logger.info("Hydrated profile %s from Redis", player_key)
        return True
    except Exception as e:
        logger.warning("Failed to hydrate profile %s: %s", player_key, e)
        return False


async def profile_exists(player_key: str) -> bool:
    """Lightweight existence check for the GET preflight endpoint."""
    client = await _get_client()
    if client is None:
        return False
    try:
        return bool(await client.exists(_profile_key(player_key)))
    except Exception:
        return False


# ── Single-flight build lock ───────────────────────────────────────────


class BuildLock:
    """Async context manager for the per-player profile build lock.

    Usage:
        async with BuildLock(player_key) as got_it:
            if not got_it:
                ... wait or short-circuit ...
            ... do the build ...

    Falls open (acts as if the lock was acquired) when Redis is down so
    we never block builds entirely on an infrastructure outage.
    """

    def __init__(self, player_key: str):
        self.key = _lock_key(player_key)
        self._client: aioredis.Redis | None = None
        self._held = False

    async def __aenter__(self) -> bool:
        self._client = await _get_client()
        if self._client is None:
            self._held = True  # fall open
            return True
        try:
            acquired = await self._client.set(self.key, b"1", nx=True, ex=LOCK_TTL_SECONDS)
            self._held = bool(acquired)
            return self._held
        except Exception as e:
            logger.warning("Build-lock acquire failed for %s: %s", self.key, e)
            self._held = True  # fall open
            return True

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._held and self._client is not None:
            try:
                await self._client.delete(self.key)
            except Exception:
                pass


async def wait_for_build(player_key: str, max_wait_seconds: float = 30.0) -> bool:
    """Poll Redis until another worker's build finishes (lock released and
    profile cached). Returns True if a profile became available in time."""
    interval = 0.5
    waited = 0.0
    while waited < max_wait_seconds:
        if await profile_exists(player_key):
            return True
        await asyncio.sleep(interval)
        waited += interval
    return False
