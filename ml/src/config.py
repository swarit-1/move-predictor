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

    # PLAN.md S2: shared secret required on every request when set. The
    # gateway sends it as X-Internal-Key; direct network access is denied.
    ml_internal_key: str = ""

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
    # PRD §5.2: bumped from 25 → 33 with the addition of sacrifice_rate,
    # eval_volatility, king_attack_intensity, quiet_move_ratio,
    # opening_cpl, middlegame_cpl, endgame_cpl, capture_initiation_rate.
    # The MovePredictor architecture reads `num_player_stats` for the
    # player-embedding input width, so this is the version bump.
    num_player_stats: int = 33
    board_channels: int = 18
    num_time_controls: int = 5  # 0=unknown, 1=bullet, 2=blitz, 3=rapid, 4=classical

    # Inference
    # Blind-spot logit biases on the trained-model path. The trained policy
    # already encodes bracket-typical human error, so biases default to a
    # reduced strength there (fallback paths always use full strength).
    # 0.0 disables, 1.0 = full strength.
    model_path_blind_spot_scale: float = 0.35
    # Max logit boost added to moves the cloned player has actually played
    # in the current position (their PersonalExplorer index). Applied on
    # the trained-model path; 0.0 disables the prior.
    personal_prior_boost: float = 3.0

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
