"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite+aiosqlite:///./move_predictor.db"
    database_url_sync: str = "sqlite:///./move_predictor.db"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # ML Service
    ml_service_host: str = "0.0.0.0"
    ml_service_port: int = 8000

    # Stockfish
    stockfish_path: str = "/usr/local/bin/stockfish"
    stockfish_depth: int = 18
    stockfish_threads: int = 1
    stockfish_pool_size: int = 4

    # Lichess
    lichess_api_token: str = ""

    # Training
    device: str = "cpu"
    batch_size: int = 1024
    learning_rate: float = 1e-3
    num_epochs: int = 20
    checkpoint_dir: str = "data/checkpoints"
    log_dir: str = "runs"

    # Model
    resnet_blocks: int = 15
    resnet_channels: int = 256
    transformer_layers: int = 4
    transformer_heads: int = 8
    d_model: int = 256
    player_embed_dim: int = 128
    fusion_dim: int = 512
    move_vocab_size: int = 1858
    history_length: int = 12
    max_players: int = 200_000
    num_player_stats: int = 25
    board_channels: int = 18

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
