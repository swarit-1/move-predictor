"""CRUD operations for database models."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Player, Game


async def get_or_create_player(
    session: AsyncSession,
    username: str,
    source: str,
    rating: float = 1500.0,
) -> Player:
    """Get an existing player or create a new one."""
    stmt = select(Player).where(Player.username == username, Player.source == source)
    result = await session.execute(stmt)
    player = result.scalar_one_or_none()

    if player is None:
        player = Player(username=username, source=source, rating=rating)
        session.add(player)
        await session.flush()

    return player


async def store_game(
    session: AsyncSession,
    pgn: str,
    player_id: int | None = None,
    metadata: dict | None = None,
) -> Game:
    """Store a game in the database, avoiding duplicates."""
    metadata = metadata or {}

    # Check for duplicate by source_id
    source_id = metadata.get("source_id")
    if source_id:
        stmt = select(Game).where(Game.source_id == source_id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

    game = Game(
        player_id=player_id,
        pgn=pgn,
        white=metadata.get("white"),
        black=metadata.get("black"),
        white_elo=metadata.get("white_elo"),
        black_elo=metadata.get("black_elo"),
        result=metadata.get("result"),
        eco=metadata.get("eco"),
        time_control=metadata.get("time_control"),
        num_moves=metadata.get("num_moves", 0),
        source=metadata.get("source", "upload"),
        source_id=source_id,
    )
    session.add(game)
    await session.flush()
    return game
