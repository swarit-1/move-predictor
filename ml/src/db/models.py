"""SQLAlchemy ORM models for the move predictor database."""

from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, JSON, ForeignKey
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), nullable=False)
    source = Column(String(50), nullable=False)  # "lichess" or "chesscom"
    rating = Column(Float, default=1500.0)
    num_games = Column(Integer, default=0)
    stats_json = Column(JSON, nullable=True)  # serialized PlayerStats
    embedding_vector = Column(JSON, nullable=True)  # serialized numpy array
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    games = relationship("Game", back_populates="player")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    pgn = Column(Text, nullable=False)
    white = Column(String(255))
    black = Column(String(255))
    white_elo = Column(Integer, nullable=True)
    black_elo = Column(Integer, nullable=True)
    result = Column(String(10))
    eco = Column(String(10), nullable=True)
    time_control = Column(String(50), nullable=True)
    num_moves = Column(Integer, default=0)
    source = Column(String(50))  # "lichess", "chesscom", "upload"
    source_id = Column(String(255), nullable=True)  # for deduplication
    annotated = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    player = relationship("Player", back_populates="games")


class TrainingRun(Base):
    __tablename__ = "training_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phase = Column(Integer, nullable=False)
    status = Column(String(50), default="pending")
    config_json = Column(JSON, nullable=True)
    metrics_json = Column(JSON, nullable=True)
    checkpoint_path = Column(String(500), nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
