# Move Predictor

A production-grade, human-aware chess move prediction system powered by deep learning. Unlike traditional chess engines that search for the objectively best move, Move Predictor models how **real humans** play — predicting the most likely move a player of a given skill level and style would make, including realistic mistakes and deviations from optimal play.

The system fetches real player games from Lichess and Chess.com, builds per-player behavioral embeddings, and can simulate specific real-world opponents with tunable style controls.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [System Architecture](#system-architecture)
- [Neural Network Design](#neural-network-design)
  - [Board Representation](#board-representation)
  - [Move Encoding](#move-encoding)
  - [Model Components](#model-components)
  - [Multi-Task Learning](#multi-task-learning)
  - [Skill-Aware Sampling](#skill-aware-sampling)
  - [Blind Spot Biases](#blind-spot-biases)
  - [Nucleus Sampling](#nucleus-top-p-sampling)
  - [Lichess Opening Explorer Integration](#lichess-opening-explorer-integration)
  - [Stockfish Fallback](#stockfish-fallback-no-checkpoint-mode)
- [Data Pipeline](#data-pipeline)
  - [Ingestion](#ingestion)
  - [Preprocessing](#preprocessing)
  - [Stockfish Annotation](#stockfish-annotation)
  - [Dataset Format](#dataset-format)
- [Training Strategy](#training-strategy)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Local Development (Recommended)](#local-development-recommended)
  - [Docker](#docker)
  - [Running Individual Services](#running-individual-services)
- [End-to-End Workflow](#end-to-end-workflow)
- [API Reference](#api-reference)
  - [Backend Gateway](#backend-gateway-port-3000)
  - [ML Service](#ml-service-port-8000)
  - [Prediction Request/Response](#prediction-requestresponse)
  - [Simulation Sessions](#simulation-sessions)
- [Frontend Features](#frontend-features)
  - [Game Review](#game-review)
- [Configuration Reference](#configuration-reference)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Evaluation Metrics](#evaluation-metrics)
- [Comparison to Chess Engines](#comparison-to-chess-engines)
- [Technical Decisions and Tradeoffs](#technical-decisions-and-tradeoffs)
- [Future Improvements](#future-improvements)

---

## Why This Exists

Chess engines like Stockfish and AlphaZero solve a different problem: they find the objectively best move through exhaustive search or self-play reinforcement learning. They are superhuman but tell you nothing about how a 1200-rated player would actually respond to your Sicilian Defense.

Move Predictor addresses three connected tasks that engines cannot:

1. **Human Move Prediction** — Given a board state, move history, and player profile, predict the probability distribution over moves a human would play. Not the best move. The *human* move.

2. **Error and Deviation Modeling** — Predict how far a player will deviate from optimal play: expected centipawn loss, blunder probability, conditioned on rating, game phase, position complexity, and fatigue (move number).

3. **Opponent Simulation** — Given a player's username, fetch their historical games, build a behavioral embedding, and simulate their play style with tunable parameters.

This is inspired by [Maia Chess](https://maiachess.com/) and [Maia-2](https://arxiv.org/abs/2409.20553), which demonstrated that dedicated human prediction models can achieve ~50% top-1 move-match accuracy — far exceeding what you get by degrading engine output.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                   │
│  Interactive Board  |  Predictions  |  Simulation  |  Sliders │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────▼────────────────────────────────┐
│              Node.js API Gateway (Express + TypeScript)        │
│  Routing  |  Validation (Zod)  |  Redis Cache  |  Rate Limit  │
└──────────┬────────────────────────────────────┬──────────────┘
           │ HTTP :8000                         │ SQL
┌──────────▼────────────────────┐    ┌──────────▼──────────────┐
│    Python ML Service (FastAPI) │    │      PostgreSQL 16       │
│  ┌──────────────────────────┐ │    │   Players, Games,        │
│  │     PyTorch Model        │ │    │   Annotations, Runs      │
│  │  ┌─────────────────────┐ │ │    └─────────────────────────┘
│  │  │  Board Encoder      │ │ │
│  │  │  (15-block ResNet)  │ │ │    ┌─────────────────────────┐
│  │  ├─────────────────────┤ │ │    │        Redis 7           │
│  │  │  Sequence Encoder   │ │ │    │   Prediction cache,      │
│  │  │  (4-layer Xformer)  │ │ │    │   Stockfish result cache │
│  │  ├─────────────────────┤ │ │    └─────────────────────────┘
│  │  │  Player Embedding   │ │ │
│  │  ├─────────────────────┤ │ │
│  │  │  Skill-Aware Fusion │ │ │
│  │  ├─────────────────────┤ │ │
│  │  │  Policy + Value +   │ │ │
│  │  │  Error Heads        │ │ │
│  │  └─────────────────────┘ │ │
│  └──────────────────────────┘ │
│  ┌──────────────────────────┐ │
│  │   Stockfish Process Pool  │ │
│  │   (4 parallel instances)  │ │
│  └──────────────────────────┘ │
└───────────────────────────────┘
```

**Communication flow:**
1. User interacts with the React frontend (plays moves, adjusts style sliders, searches opponents).
2. Frontend calls the Node.js gateway, which validates requests, checks Redis cache, and proxies to the ML service.
3. The ML service runs the PyTorch model for move prediction, optionally queries Stockfish for comparison, and returns the prediction with explainability metadata.
4. Results are cached in Redis (30 min for predictions, 24 hours for Stockfish analysis).

---

## Neural Network Design

### Board Representation

Every chess position is encoded as an **18-channel 8x8 float32 tensor**. The board is always oriented from the moving side's perspective (vertically flipped for Black), so the model learns a single unified representation.

| Channels | Content | Encoding |
|----------|---------|----------|
| 0–5 | Active side pieces (P, N, B, R, Q, K) | Binary (0 or 1) |
| 6–11 | Opponent pieces (P, N, B, R, Q, K) | Binary (0 or 1) |
| 12 | Active side attack map | Integer count of attackers per square |
| 13 | Opponent attack map | Integer count of attackers per square |
| 14 | Side to move | Uniform 1.0 (always, due to flipping) |
| 15 | Castling rights | Scalar: own K-side 0.25 + own Q-side 0.25 + opp K-side 0.125 + opp Q-side 0.125 |
| 16 | En passant target | Single 1.0 on the target square, rest 0 |
| 17 | Halfmove clock | Uniform scalar, normalized by dividing by 100 |

**Implementation:** [ml/src/data/preprocessing.py](ml/src/data/preprocessing.py)

The attack maps in channels 12–13 give the model immediate spatial information about piece control and tension without needing to learn these patterns from raw piece placements alone.

### Move Encoding

Moves are encoded into a **fixed vocabulary of 1,858 indices**, following the scheme used by Leela Chess Zero and Maia:

- **56 queen-like moves**: 7 distances x 8 compass directions (N, NE, E, SE, S, SW, W, NW)
- **8 knight moves**: the 8 possible L-shaped offsets
- **9 underpromotions**: 3 directions (left-capture, straight, right-capture) x 3 pieces (knight, bishop, rook)
- Queen promotions are covered by the queen-like moves (a pawn reaching rank 8 moving forward is encoded as a queen-like move of distance 1 north, which maps to a queen promotion)

Each entry in the vocabulary is a `(from_square, move_type)` pair. For Black moves, squares are mirrored vertically before encoding so the model sees a consistent orientation.

At inference time, illegal moves are masked to `-inf` before applying softmax, ensuring the output is a valid probability distribution over legal moves only.

**Implementation:** [ml/src/models/move_encoding.py](ml/src/models/move_encoding.py)

### Model Components

The full model (`MovePredictor`) assembles five sub-modules and three output heads:

```
Board Tensor (18, 8, 8)  ──→  Board Encoder  ──→  (B, 256)  ──┐
                                                                 │
Move History (B, 12)      ──→  Seq Encoder    ──→  (B, 256)  ──┼──→  Fusion  ──→  (B, 512)
                                                                 │       ↑
Player ID + Stats         ──→  Player Embed   ──→  (B, 128)  ──┘       │
                                                                 Player features
                                                                 gate the fused
                                                                 representation
                                                                        │
                                              ┌─────────────────────────┼─────────────────────┐
                                              ▼                         ▼                     ▼
                                       Policy Head              Value Head             Error Head
                                       (B, 1858)                (B, 1)                (B, 2)
                                     Move probs [-1,1]         Position eval    CPL pred + blunder prob
```

#### Board Encoder — ResNet Tower (~5.8M parameters)

A 15-block residual convolutional network with 256 channels per block. Each block consists of two 3x3 convolutions with batch normalization and ReLU, plus a skip connection. Global average pooling reduces the spatial output to a 256-dim vector.

**Why ResNet over Vision Transformer:** The 8x8 chess board is too small for ViTs to outperform CNNs. Vision Transformers excel on larger spatial inputs (224x224+) and need substantially larger training sets to match CNNs at small resolutions. The convolutional inductive bias — locality and translation equivariance — is directly useful for chess where piece interactions are spatially local. This choice is validated by Maia and Maia-2, both of which use ResNet backbones.

**Implementation:** [ml/src/models/board_encoder.py](ml/src/models/board_encoder.py)

#### Sequence Encoder — Transformer (~2.1M parameters)

A 4-layer Transformer encoder over the last 12 half-moves (configurable via `history_length`). Each move in the history is embedded via a learned embedding table over the 1,858-move vocabulary, combined with learned positional embeddings and an optional game phase embedding (opening=0, middlegame=1, endgame=2).

The encoder uses pre-layer normalization (`norm_first=True`) for training stability, 8 attention heads, and a feedforward dimension of 512. The output is mean-pooled over non-padded positions and layer-normalized.

**Implementation:** [ml/src/models/sequence_encoder.py](ml/src/models/sequence_encoder.py)

#### Player Embedding Module

Combines a learned **discrete embedding** per player (128-dim, up to 200,000 players) with **25 continuous statistics** computed from the player's games:

| Statistic | Description |
|-----------|-------------|
| `rating` | Normalized ELO rating |
| `avg_centipawn_loss` | Average CPL across games |
| `blunder_rate` | Fraction of moves that are blunders |
| `aggression_index` | Ratio of attacking vs quiet moves |
| `tactical_tendency` | Ratio of captures + checks to total moves |
| `opening_diversity` | Entropy of opening choices |
| `win_rate`, `draw_rate` | Game outcomes |
| `e4_ratio`, `d4_ratio` | Opening preferences |
| `piece_activity` | Piece mobility tendency |
| `king_safety_preference` | King safety weighting |
| ... | 25 total features |

For unknown/new players, the discrete embedding is initialized to zeros (the padding embedding), and the continuous stats provide the model with all available signal.

**Implementation:** [ml/src/models/player_embedding.py](ml/src/models/player_embedding.py), [ml/src/data/player_stats.py](ml/src/data/player_stats.py)

#### Skill-Aware Fusion Layer (~0.7M parameters)

A two-layer MLP that concatenates board (256), sequence (256), and player (128) features into a 640-dim input, projecting to a 512-dim fused representation. The key innovation is a **player-conditioned gating mechanism**:

```python
gate = sigmoid(linear(player_features))     # (B, 512)
output = fused * gate                        # element-wise
```

This lets the player embedding modulate which aspects of the board and sequence representation the model attends to. An aggressive player's gate shifts the fused features differently than a positional player's, allowing the downstream heads to produce different move distributions from identical positions.

**Implementation:** [ml/src/models/fusion.py](ml/src/models/fusion.py)

### Multi-Task Learning

The model is trained with three simultaneous objectives:

| Head | Task | Loss | Weight |
|------|------|------|--------|
| **Policy** | Predict which move was played | Cross-entropy over 1,858-move vocabulary | 1.0 (Phase 1), 2.0 (Phase 2+) |
| **Value** | Predict position evaluation | MSE against Stockfish eval (normalized to [-1, 1]) | 0.5 |
| **Error** | Predict centipawn loss + blunder probability | MSE(CPL) + Binary Cross-Entropy(blunder) | 0.5 each |

The combined loss:

```
L = λ_policy * CE(policy_logits, move_target)
  + λ_value  * MSE(value_pred, eval_target)
  + λ_cpl    * MSE(cpl_pred, cpl_target)
  + λ_blunder * BCE(blunder_logit, blunder_target)
```

An optional uncertainty-based weighting mode (Kendall et al., "Multi-Task Learning Using Uncertainty to Weigh Losses") learns the loss weights as trainable log-variance parameters, automatically balancing the four objectives.

**Implementation:** [ml/src/training/losses.py](ml/src/training/losses.py)

### Skill-Aware Sampling

This is the core differentiator of the system. At inference time, the model does **not** use `argmax` to select the most probable move. Instead, it uses a three-stage sampling pipeline:

1. **Blind spot biases** — Position-aware logit adjustments that model specific cognitive errors (see below).
2. **Temperature scaling** — Modulates randomness among candidate moves based on rating, predicted error, style, and time pressure.
3. **Nucleus (top-p) sampling** — Eliminates garbage moves from the distribution tail while preserving structured human errors.

The temperature formula (ceiling 1.0 — blind spots and top-p handle error modeling):

```python
base_temp = max(0.3, 0.95 - rating / 4000.0)                    # rating component
error_temp = 0.2 * predicted_cpl + 0.1 * blunder_prob            # error component
temperature = (base_temp + error_temp * 0.2) * style_factors
temperature *= (1.0 + 0.5 * time_pressure)                       # time trouble
temperature = clamp(temperature, 0.25, 1.0)
```

Additionally, the aggression slider applies a logit bias to captures and checks before sampling:

```python
if is_capture(move):  logits[idx] += aggression_boost * 1.5
if gives_check(move): logits[idx] += aggression_boost * 1.0
```

This produces realistic human play: a 2400-rated model plays almost engine-like (low temperature, tight nucleus), while a 1000-rated model occasionally falls for traps, grabs poisoned material, and shows style-specific tendencies — but never makes random queen shuffles.

**Implementation:** [ml/src/inference/sampler.py](ml/src/inference/sampler.py)

### Blind Spot Biases

Instead of relying solely on temperature to produce human-like mistakes, the system applies **position-aware biases** that model specific cognitive blind spots common in human chess players. Each bias operates on the logit distribution *before* temperature scaling and nucleus filtering:

| Bias | Effect | Strength Scaling |
|------|--------|-----------------|
| **Tactical blindness** | Penalizes quiet engine-best moves and discovered attacks that humans routinely miss | `weakness × 0.8` |
| **Material greed** | Boosts captures proportional to piece value, especially undefended pieces | `weakness × 0.6 + 0.1` |
| **Check attraction** | Boosts checks even when they waste tempo — "patzer sees a check, patzer gives a check" | `weakness × 0.5 + 0.05` |
| **Piece preference** | Biases toward queen moves and central knight hops, away from rook moves | `weakness × 0.3` |
| **King safety neglect** | Penalizes non-castling moves when castling is available; deprioritizes prophylactic pawn moves | `weakness × 0.5` |
| **Long-range blindness** | Penalizes long-distance slider moves (4+ squares) that are engine-best — humans miss long diagonals | `weakness × 0.7` |
| **King attack neglect** | Penalizes retreating pieces away from the enemy king when 3+ attackers have pressure on the king zone | `weakness × 0.6` |

The `weakness` factor is derived from rating: `max(0, (2400 - rating) / 1800)`. A 600-rated player has weakness ~1.0 (strong blind spots), while a 2400+ player has weakness ~0.0.

Bias magnitudes are tuned to be strong enough to push human-like bad moves *into* the nucleus sampling threshold while garbage moves remain outside.

**Implementation:** [ml/src/inference/blind_spots.py](ml/src/inference/blind_spots.py)

### Nucleus (Top-P) Sampling

The system uses **nucleus sampling** (the same technique used by GPT and Claude) to eliminate random garbage moves from the tail of the probability distribution. After temperature scaling produces a softmax distribution, nucleus sampling:

1. Sorts moves by probability descending
2. Keeps only the smallest set of moves whose cumulative probability exceeds a threshold (top-p)
3. Zeros out everything else and renormalizes

The top-p threshold scales with rating:

| Rating | Top-p | Approximate Candidate Moves |
|--------|-------|---------------------------|
| 400 | 0.97 | 15–20 |
| 1000 | 0.95 | 10–15 |
| 1500 | 0.92 | 7–10 |
| 2000 | 0.88 | 5–7 |
| 2500 | 0.82 | 3–5 |

An additional **0.3% probability floor** ensures no move with less than 1-in-300 probability can be sampled, even if it falls within the nucleus.

**Why this matters:** With pure temperature sampling, a position with 50 legal moves at temperature 1.0 gives each tail move ~0.05% probability individually — but collectively the 30+ garbage moves have ~1.5% total probability per position. Over a 30-move game, that's ~3 random-feeling blunders. Nucleus sampling eliminates this entirely while preserving blind-spot-boosted human-like mistakes.

**Implementation:** [ml/src/inference/sampler.py](ml/src/inference/sampler.py)

### Lichess Opening Explorer Integration

When no trained model checkpoint is available, the system queries the **Lichess Opening Explorer API** for real human move distributions. This provides statistically grounded move choices based on millions of actual games.

The data source priority (4-tier fallback):

1. **Player-specific explorer stats** — If the opponent is a Lichess player, query their personal move history for the current position via the `/player` endpoint.
2. **Opening book** — Per-player opening book built from fetched games, giving exact move probabilities from their game history.
3. **Rating-bracket explorer** — Aggregate human move statistics from the Lichess explorer, filtered by the closest rating bracket (e.g., 1600–1800 games).
4. **Stockfish fallback** — For positions not in any explorer database, build logits from Stockfish analysis with piece-type-weighted gaps.

Explorer-sourced data uses lighter sampling (reduced CPL/blunder estimates, blind spots disabled) since the move distributions are already realistic. Stockfish fallback applies the full blind spot system.

**Implementation:** [ml/src/data/lichess_explorer.py](ml/src/data/lichess_explorer.py), [ml/src/inference/pipeline.py](ml/src/inference/pipeline.py)

### Stockfish Fallback (No Checkpoint Mode)

When no trained model checkpoint is available and the position is not in any explorer database, the system builds a realistic policy distribution from Stockfish analysis:

1. **Engine-based logits**: Stockfish's top moves receive high logits (5.0 for the best move, decaying by rank and centipawn difference). Non-engine moves get piece-type-weighted logits with wide gaps to separate reasonable from garbage:
   - Pawns: -2.0 to -3.0 (depending on centrality)
   - Knights: -3.0 to -4.0 (center vs rim)
   - Bishops: -5.0
   - Rooks: -7.0
   - Queens: -8.0
   - King (non-castling): -10.0
   - Castling: -0.5

2. **Rating-calibrated error**: CPL and blunder probability are estimated from the target rating:
   - CPL: `max(0.0, 3.0 - rating × 0.0012)` (~1.8 at 1000, ~0.6 at 2000)
   - Blunder: `max(0.02, 0.35 - rating × 0.00012)` (~23% at 1000, ~11% at 2000)

3. **Full sampling pipeline**: These logits pass through blind spots → temperature → nucleus sampling → probability floor, so all rating and style controls work identically to the trained model path.

**Implementation:** [ml/src/inference/pipeline.py](ml/src/inference/pipeline.py)

---

## Data Pipeline

### Ingestion

Games can be sourced from three inputs:

| Source | Method | Format | API |
|--------|--------|--------|-----|
| **Lichess** | Async streaming via `httpx` | NDJSON/PGN stream | Lichess API v2 (rate limit: 20–30 req/s) |
| **Chess.com** | Monthly archive fetching | JSON with embedded PGN | Chess.com Published Data API |
| **PGN Upload** | Direct file upload | Standard PGN file | File system / multipart upload |

The Lichess client streams games using `aiter_lines()` for memory efficiency and supports filtering by game type (blitz, rapid, classical) and rated-only games. The Chess.com client fetches monthly archives in reverse chronological order.

**Implementation:** [ml/src/data/sources/lichess.py](ml/src/data/sources/lichess.py), [ml/src/data/sources/chesscom.py](ml/src/data/sources/chesscom.py), [ml/src/data/sources/pgn_loader.py](ml/src/data/sources/pgn_loader.py)

### Preprocessing

For each game, every position is processed into a training example:

1. Parse PGN into a `python-chess` Game object.
2. Iterate through each move. At each position:
   - Generate the 18-channel board tensor.
   - Encode the played move as a 1,858-vocabulary index.
   - Record the last 12 half-moves as a sequence of indices (padded with 0 for early game).
   - Classify the game phase (opening/middlegame/endgame) based on material count and move number.
3. Optionally annotate with Stockfish (see below).
4. Store as HDF5 for fast training reads.

**Implementation:** [ml/src/data/feature_extraction.py](ml/src/data/feature_extraction.py), [ml/scripts/preprocess_corpus.py](ml/scripts/preprocess_corpus.py)

### Stockfish Annotation

A process pool of Stockfish instances analyzes positions concurrently:

- **Depth 18** for curated datasets (high accuracy).
- **Depth 12** for bulk preprocessing (faster, minimal accuracy loss for move quality classification).
- **Top-5 multi-PV** per position for ranking the played move against alternatives.

For each position, the annotation pipeline computes:
- **Best move** (UCI notation)
- **Top-5 moves** with centipawn evaluations
- **Centipawn loss** of the played move = `eval(best_move) - eval(played_move)`
- **Move quality classification**: best (CPL = 0), good (CPL < 20), inaccuracy (20 <= CPL < 50), mistake (50 <= CPL < 100), blunder (CPL >= 100)

If the played move isn't in the top-5, the system analyzes the resulting position separately to compute the CPL accurately.

**Implementation:** [ml/src/engine/stockfish_pool.py](ml/src/engine/stockfish_pool.py), [ml/src/engine/analysis.py](ml/src/engine/analysis.py)

### Dataset Format

Preprocessed data is stored in HDF5 files for memory-mapped, random-access loading:

| Field | Shape | Type | Description |
|-------|-------|------|-------------|
| `board_tensor` | (N, 18, 8, 8) | float32 | Board representation |
| `move_history` | (N, 12) | int64 | Last 12 move indices |
| `player_id` | (N,) | int64 | Player ID |
| `player_stats` | (N, 25) | float32 | Continuous player features |
| `game_phase` | (N,) | int64 | 0/1/2 for opening/middle/endgame |
| `move_index` | (N,) | int64 | Target move (label) |
| `eval_score` | (N,) | float32 | Position eval (label) |
| `centipawn_loss` | (N,) | float32 | CPL of played move (label) |
| `is_blunder` | (N,) | float32 | Blunder indicator (label) |

Splits are by **game** (not by position) to prevent data leakage: 90% train / 5% validation / 5% test.

**Implementation:** [ml/src/data/dataset.py](ml/src/data/dataset.py)

---

## Training Strategy

Training proceeds in three phases, each building on the previous checkpoint:

### Phase 1: Pretrain on Large Corpus

| Parameter | Value |
|-----------|-------|
| Data | 10–50M positions from Lichess monthly dumps |
| Player module | Rating-bucket embeddings (20 buckets, 600–2800); discrete player embeddings frozen |
| Optimizer | AdamW, lr=1e-3, weight_decay=1e-4, cosine annealing with warmup |
| Batch size | 1024 |
| Precision | Mixed fp16 (PyTorch AMP) |
| Duration | ~20 epochs |
| Target | >36% top-1 move-match accuracy |
| Loss weights | policy=1.0, value=0.5, CPL=0.5, blunder=0.5 |

### Phase 2: Fine-tune with Player Embeddings

| Parameter | Value |
|-----------|-------|
| Data | Per-player game sets (minimum 100 games per player) |
| Frozen | First 10 ResNet blocks; fine-tune last 5 + sequence encoder + fusion + heads |
| Player module | Learn per-player embedding table from scratch |
| Optimizer | AdamW, lr=1e-4 |
| Duration | 5–10 epochs |
| Target | >42% top-1 for players with 500+ games |
| Loss weights | policy=2.0 (upweighted), value=0.5, CPL=0.5, blunder=0.5 |

### Phase 3: Few-Shot Player Adaptation

| Parameter | Value |
|-----------|-------|
| Data | 10–50 games from a new player |
| Frozen | Entire model except player embedding |
| Initialization | Player embedding initialized from K-nearest rating-bucket average |
| Duration | 2–3 epochs |
| Use case | "Play Against Real Opponent" quick-build mode |

```bash
# Phase 1
python3 ml/scripts/train.py --phase 1 --data data/processed/train.h5 --epochs 20 --lr 0.001

# Phase 2 (from Phase 1 checkpoint)
python3 ml/scripts/train.py --phase 2 --data data/processed/train.h5 --checkpoint data/checkpoints/phase1_best.pt --epochs 10 --lr 0.0001

# Phase 3 (for a specific player)
python3 ml/scripts/train.py --phase 3 --data data/processed/player_games.h5 --checkpoint data/checkpoints/phase2_best.pt --epochs 3
```

All training runs support TensorBoard logging (`runs/` directory), automatic checkpointing (latest + best), and gradient clipping (max norm 1.0).

**Implementation:** [ml/src/training/trainer.py](ml/src/training/trainer.py), [ml/scripts/train.py](ml/scripts/train.py)

---

## Quick Start

### Prerequisites

- **Python 3.11+** (with pip)
- **Node.js 20+** (with npm)
- **Docker & Docker Compose** (optional — for full-stack deployment or running PostgreSQL/Redis)
- **Stockfish 17** binary (auto-downloaded by the startup script if not found)

### Local Development (Recommended)

The easiest way to get everything running locally:

```bash
# Clone and enter the repo
git clone <repo-url> && cd move-predictor

# Run the automated startup script
./start-dev.sh
```

The startup script automatically:
1. Checks for Python 3.11+ and Node.js 20+
2. Installs ML, backend, and frontend dependencies if missing
3. Downloads Stockfish if not already present
4. Writes the ML service `.env` file with the correct Stockfish path
5. Starts all three services with health-check polling
6. Provides a clean `Ctrl+C` shutdown for all processes

Services:
- ML service on `http://localhost:8000` (uvicorn with hot reload)
- Backend on `http://localhost:3000` (tsx with hot reload)
- Frontend on `http://localhost:5173` (Vite dev server)

Logs are written to `.dev-logs/` (ml.log, backend.log, frontend.log).

You can also use `make dev` which calls `start-dev.sh` under the hood.

### Docker

For containerized deployment:

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, the ML service (:8000), the backend (:3000), and the frontend (:5173). Note: Docker is **not required** for local development — `start-dev.sh` handles everything with a local SQLite database.

### Running Individual Services

```bash
# ML Service only
make dev-ml

# Backend only
make dev-backend

# Frontend only
make dev-frontend
```

---

## End-to-End Workflow

A typical workflow from zero to playing against a simulated opponent:

```bash
# 1. Download and install Stockfish
make download-stockfish

# 2. Fetch games for a specific player
cd ml && python3 scripts/fetch_lichess_data.py DrNykterstein --max-games 1000

# 3. Preprocess games into HDF5 training data
python3 scripts/preprocess_corpus.py data/raw/ --output data/processed/train.h5 --val-split 0.05

# 4. Train Phase 1 (general human move prediction)
python3 scripts/train.py --phase 1 --data data/processed/train.h5 --val-data data/processed/val.h5 --epochs 20

# 5. Start the services
cd .. && ./start-dev.sh

# 6. Open the frontend at http://localhost:5173
#    - The Setup Screen lets you configure your game:
#      - Choose to play as White or Black
#      - Select an opponent by Player Profile, Rating, or Custom Style
#    - Click "Start Game" to enter the game
#    - Make your move — the opponent responds automatically
#    - Adjust style sliders to modify opponent behavior
```

Alternatively, use the API directly:

```bash
# Predict the most likely human move
curl -X POST http://localhost:3000/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "player_rating": 1500,
    "style_overrides": {"aggression": 70, "risk_taking": 60}
  }'
```

---

## API Reference

### Backend Gateway (Port 3001)

All responses follow `{ success: boolean, data?: T, error?: string }`.

#### Games

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/games/import` | `{ source: "lichess"\|"chesscom", username: string, max_games?: number }` | Fetch games from an external source |
| `POST` | `/api/games/upload` | Multipart form with `pgn` file | Upload a PGN file |

#### Players

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/players/build-profile` | `{ source: "lichess"\|"chesscom", username: string, max_games?: number }` | Build a style profile from game history |
| `GET` | `/api/players/search?q=name` | — | Search for players |

#### Predictions

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/predict` | See [schema below](#prediction-requestresponse) | Get human move prediction |
| `POST` | `/api/predict/analyze` | `{ fen: string, depth?: number }` | Get raw Stockfish analysis |
| `POST` | `/api/predict/review` | `{ moves: string[], depth?: number }` | Full game review with per-move analysis |

#### Simulation

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/simulate/start` | `{ white_rating?, black_rating?, style_overrides? }` | Start a simulation game session |
| `POST` | `/api/simulate/:id/move` | `{ move?: string }` | Play a move or request AI move |
| `GET` | `/api/simulate/:id` | — | Get session state |

#### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (includes ML service status) |

### ML Service (Port 8000)

Internal service — the Node.js gateway is the only expected consumer.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ml/predict` | Raw model inference |
| `POST` | `/ml/analyze` | Stockfish position analysis |
| `POST` | `/ml/review` | Full game review (parallel Stockfish analysis) |
| `POST` | `/ml/player/build-profile` | Build player embedding from games |
| `GET` | `/ml/player/:id/stats` | Get player statistics |
| `POST` | `/ml/training/start` | Trigger training job |
| `GET` | `/ml/training/:job_id` | Training job status |
| `GET` | `/ml/health` | Health check (model, Stockfish, GPU status) |

### Prediction Request/Response

**Request:**

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "move_history": ["e2e4"],
  "player_id": 0,
  "player_rating": 1500.0,
  "player_key": "lichess:DrNykterstein",
  "style_overrides": {
    "aggression": 70,
    "risk_taking": 50,
    "blunder_frequency": 30
  },
  "time_remaining": 180.0,
  "time_control_initial": 300.0
}
```

**Response:**

```json
{
  "move": "e7e5",
  "probability": 0.32,
  "temperature": 0.85,
  "top_moves": [
    { "move_uci": "e7e5", "probability": 0.32, "engine_rank": 2 },
    { "move_uci": "c7c5", "probability": 0.18, "engine_rank": 1 },
    { "move_uci": "e7e6", "probability": 0.12, "engine_rank": 4 },
    { "move_uci": "d7d5", "probability": 0.10, "engine_rank": 3 },
    { "move_uci": "g8f6", "probability": 0.08, "engine_rank": 5 }
  ],
  "predicted_cpl": 12.5,
  "blunder_probability": 0.03,
  "engine_best": "c7c5",
  "engine_top_moves": [
    { "move": "c7c5", "rank": 1, "cp": 35 },
    { "move": "e7e5", "rank": 2, "cp": 30 }
  ],
  "explanation": {
    "is_deviation": true,
    "deviation_reason": "Model's move is engine's #2 choice — a reasonable alternative, not the absolute best",
    "engine_rank": 2,
    "centipawn_cost": 5,
    "factors": [
      "Model's move is engine's #2 choice — a reasonable alternative, not the absolute best",
      "Choosing this move costs ~5 centipawns vs the engine best",
      "In the opening, humans often follow familiar patterns rather than calculating the objectively best move"
    ]
  }
}
```

### Simulation Sessions

Start a game, then alternate between your moves and AI moves:

```bash
# Start
curl -X POST http://localhost:3000/api/simulate/start \
  -H "Content-Type: application/json" \
  -d '{"black_rating": 1500}'

# Play e4 (your move), AI responds
curl -X POST http://localhost:3000/api/simulate/<session_id>/move \
  -H "Content-Type: application/json" \
  -d '{"move": "e2e4"}'

# Get current state
curl http://localhost:3000/api/simulate/<session_id>
```

---

## Frontend Features

The React frontend (Vite + Tailwind CSS + Zustand) features a dark-themed UI with multiple game modes accessible from the Welcome Screen, plus a post-game review feature:

### Welcome Screen
Three mode cards with descriptions and icons:
- **Play a Game** — Full setup flow with opponent selection and time controls.
- **Replay a Famous Game** — Step through iconic games and fork into "what if" scenarios.
- **Practice Openings** — Drill specific opening lines against AI at any rating.

### Setup Screen
- **Color Selection** — Choose to play as White or Black before the game starts.
- **Opponent Configuration** — Three tabs for selecting your opponent:
  - **Player Profile** — Search for a real Lichess/Chess.com player. Ratings are fetched from the platform's profile API (authoritative current rating, not PGN headers).
  - **By Rating** — Select a target ELO (400–2800) to play against a generic opponent of that skill level.
  - **Custom Style** — Fine-tune aggression, risk-taking, and blunder frequency sliders to craft a specific play style.
- **Time Control** — Choose from 8 presets (No Clock, 1+0 Bullet through 15+10 Rapid). Time controls affect AI think time and decision quality under pressure.

### Game Screen
- **Interactive Chessboard** — Responsive drag-and-drop board (320–640px) using `react-chessboard`, oriented based on your chosen color. SVG arrow overlays show engine best move (blue) and model prediction (green). Full promotion support with piece selection dialog.
- **Game Clocks** — When a time control is selected, clocks appear next to each player label. Visual states change at <30s (amber) and <10s (red pulse). The AI's remaining time is sent with prediction requests so the ML service can model time pressure.
- **Auto-Predict** — After you make a move, the opponent responds automatically with realistic think time scaled to the time control (bullet: 0.2–0.7s, blitz: 0.5–2.5s, rapid: 1–5s, classical: 2–10s). Think time decreases further when the AI is low on time.
- **Evaluation Bar** — Toggleable vertical bar showing the Stockfish position evaluation, updated after each move.
- **Evaluation Graph** — Toggleable line graph showing evaluation history across the game (advantage swings over time).
- **Analysis Panel** — Shows prediction confidence, sampling temperature, centipawn loss, blunder probability, move distribution chart (Recharts), and human-readable explanations for move choices.
- **Style Panel** — In-game adjustable style sliders (aggression, risk-taking, blunder rate) accessible from the header.
- **Error Handling** — Graceful error banners when the ML service is unreachable, with a retry button. Predictions stop retrying on connection failure to avoid spam.
- **Game Controls** — Undo, reset, and game-over detection with modal. The game over modal offers a "Review" button that launches full Stockfish analysis of the game.
- **Move List** — Scrollable, clickable move list with move navigation. Click any move to view that position on the board (turn indicator updates correctly when viewing history).
- **Opponent Badge** — Compact display of the current opponent's profile in the game header.

### Opening Practice Mode
- **Opening Browser** — Browse 29 major openings organized by category (1.e4, 1.d4, Other) with ECO codes.
- **Preview Board** — See the final position of each opening before starting.
- **Settings** — Choose which color to practice as and the opponent rating (400–2800).
- **Seamless Transition** — Opening moves are pre-applied to the game board, then normal play continues against the AI.

### Replay Mode
- **Famous Games** — Step through classic games move by move.
- **Fork & Explore** — Fork at any point and play out "what if" scenarios where the AI takes over as either side.

### Game Review
Chess.com-style post-game analysis accessible from the game over modal. Submits all moves to Stockfish for parallel analysis and returns per-move annotations with accuracy scores.

- **Per-Move Classification** — Every move is classified as Best, Excellent, Good, Inaccuracy, Mistake, or Blunder based on centipawn loss thresholds (0, 10, 25, 50, 100 CPL). Opening moves (first 16 half-moves) are marked as Book.
- **Accuracy Score** — Per-player accuracy computed using Chess.com's formula: `103.1668 * exp(-0.04354 * ACPL) - 3.1668`. Displayed as an animated SVG ring with color coding (green ≥90, yellow ≥70, orange ≥50, red <50).
- **Move Breakdown** — Category counts for each player (best+excellent, good, inaccuracy, mistake, blunder) with average centipawn loss.
- **Interactive Board** — Navigate through the game with arrow keys, Home/End, or clickable navigation buttons. The board shows color-coded arrows: played move in classification color, engine best move in blue (when different).
- **Move Detail Panel** — For the selected move, shows classification badge, eval before/after, CPL bar, best move comparison, and engine top 3 lines with evaluations.
- **Annotated Move List** — Paired white/black moves with classification badges (colored circles with symbols: !! for best, ?! for inaccuracy, ? for mistake, ?? for blunder). Notable moves highlighted with colored left borders. Auto-scrolls to the selected move.
- **Stockfish Analysis** — Uses depth-18 parallel analysis across all positions via the Stockfish process pool. Top 3 engine lines shown per position with centipawn or mate scores.

### Player Profile Display
- **Style Visualization** — Bar chart showing Aggression, Tactical tendency, Accuracy, Consistency, and Opening Variety.
- **Accuracy Handling** — When Stockfish analysis is unavailable, accuracy displays "—" instead of a misleading default value.
- **Preferred Openings** — Tag cloud showing the player's most-played openings with percentages.

---

## Configuration Reference

All configuration is via environment variables (see [.env.example](.env.example)):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./move_predictor.db` | Async database URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `ML_SERVICE_URL` | `http://localhost:8000` | ML service URL (for backend) |
| `STOCKFISH_PATH` | `/usr/local/bin/stockfish` | Path to Stockfish binary |
| `STOCKFISH_DEPTH` | `18` | Default analysis depth |
| `STOCKFISH_POOL_SIZE` | `4` | Number of Stockfish worker processes |
| `LICHESS_API_TOKEN` | *(empty)* | Lichess OAuth token (optional, raises rate limit) |
| `DEVICE` | `cpu` | PyTorch device (`cpu`, `cuda`, `mps`) |
| `BATCH_SIZE` | `1024` | Training batch size |
| `LEARNING_RATE` | `0.001` | Base learning rate |
| `NUM_EPOCHS` | `20` | Default training epochs |
| `CHECKPOINT_DIR` | `data/checkpoints` | Model checkpoint directory |
| `LOG_DIR` | `runs` | TensorBoard log directory |
| `BACKEND_PORT` | `3000` | Node.js backend port |
| `VITE_API_URL` | `http://localhost:3000/api` | Frontend API base URL |

Model architecture hyperparameters (also configurable via environment):

| Variable | Default | Description |
|----------|---------|-------------|
| `RESNET_BLOCKS` | `15` | Number of residual blocks |
| `RESNET_CHANNELS` | `256` | Channels per block |
| `TRANSFORMER_LAYERS` | `4` | Sequence encoder layers |
| `TRANSFORMER_HEADS` | `8` | Attention heads |
| `D_MODEL` | `256` | Transformer model dimension |
| `PLAYER_EMBED_DIM` | `128` | Player embedding dimension |
| `FUSION_DIM` | `512` | Fusion layer output dimension |
| `MOVE_VOCAB_SIZE` | `1858` | Move vocabulary size |
| `HISTORY_LENGTH` | `12` | Number of past moves to encode |
| `MAX_PLAYERS` | `200000` | Maximum player embedding slots |
| `NUM_PLAYER_STATS` | `25` | Continuous player features |

---

## Project Structure

```
move-predictor/
├── docker-compose.yml              # Full-stack container orchestration
├── Makefile                         # Development shortcuts
├── start-dev.sh                     # Automated local dev startup script
├── .env.example                     # Environment variable template
├── .gitignore
├── README.md
│
├── ml/                              # Python ML service
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env                         # Auto-generated by start-dev.sh
│   ├── pyproject.toml               # Dependencies + project config
│   ├── src/
│   │   ├── main.py                  # FastAPI app entrypoint
│   │   ├── config.py                # Pydantic Settings configuration
│   │   ├── api/                     # HTTP endpoints
│   │   │   ├── predict.py           # POST /ml/predict
│   │   │   ├── analyze.py           # POST /ml/analyze (Stockfish)
│   │   │   ├── players.py           # Player profile endpoints
│   │   │   ├── training.py          # Training job management
│   │   │   └── health.py            # Health check
│   │   ├── models/                  # PyTorch neural network
│   │   │   ├── move_predictor.py    # Full assembled model
│   │   │   ├── board_encoder.py     # 15-block ResNet
│   │   │   ├── sequence_encoder.py  # 4-layer Transformer
│   │   │   ├── player_embedding.py  # Per-player learned embedding
│   │   │   ├── fusion.py            # Skill-aware gated fusion
│   │   │   ├── heads.py             # Policy + Value + Error heads
│   │   │   └── move_encoding.py     # 1858-index move vocabulary
│   │   ├── engine/                  # Stockfish integration
│   │   │   ├── stockfish_pool.py    # Process pool (4 instances)
│   │   │   └── analysis.py          # CPL computation + game annotation
│   │   ├── data/                    # Data pipeline
│   │   │   ├── preprocessing.py     # FEN → 18-channel tensor
│   │   │   ├── feature_extraction.py # Position → training features
│   │   │   ├── dataset.py           # PyTorch Dataset + HDF5 I/O
│   │   │   ├── player_stats.py      # 25-feature player statistics
│   │   │   ├── opening_book.py      # Per-player opening book (trie)
│   │   │   ├── lichess_explorer.py  # Lichess Opening Explorer API client
│   │   │   └── sources/             # API clients
│   │   │       ├── lichess.py       # Lichess API (streaming)
│   │   │       ├── chesscom.py      # Chess.com API (archives)
│   │   │       └── pgn_loader.py    # File-based PGN parser
│   │   ├── training/                # Training loop
│   │   │   ├── trainer.py           # Epoch loop + checkpointing + AMP
│   │   │   ├── losses.py            # Multi-task loss (CE+MSE+BCE)
│   │   │   └── eval_metrics.py      # Top-k accuracy, AUC, MAE
│   │   ├── inference/               # Prediction pipeline
│   │   │   ├── pipeline.py          # End-to-end predict (4-tier data source)
│   │   │   ├── sampler.py           # Nucleus sampling + temperature + style
│   │   │   ├── blind_spots.py       # 7 cognitive blind spot biases
│   │   │   └── explainability.py    # Deviation explanations
│   │   └── db/                      # Database layer
│   │       ├── models.py            # SQLAlchemy ORM (Player, Game, Run)
│   │       ├── session.py           # Async session factory
│   │       └── crud.py              # CRUD operations
│   ├── scripts/
│   │   ├── download_stockfish.sh    # Platform-aware Stockfish installer
│   │   ├── download_lichess_data.py # Bulk Lichess monthly dump downloader
│   │   ├── fetch_lichess_data.py    # CLI: fetch games by username
│   │   ├── preprocess_corpus.py     # CLI: PGN → HDF5 (per-game split)
│   │   ├── train.py                 # CLI: training entrypoint
│   │   ├── train_rating_bracket.sh  # Train one rating bracket
│   │   └── train_all_brackets.sh    # Train all 9 rating brackets
│   └── tests/
│       ├── conftest.py              # Shared fixtures
│       ├── test_move_encoding.py    # Encoding roundtrip tests
│       ├── test_preprocessing.py    # Board tensor correctness
│       ├── test_model.py            # Forward pass shape tests
│       └── test_sampler.py          # Sampling, temperature, nucleus tests
│
├── backend/                         # Node.js API gateway
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 # Express app entry
│       ├── config.ts                # Environment config + logger
│       ├── routes/
│       │   ├── games.ts             # Import + upload endpoints
│       │   ├── players.ts           # Profile building
│       │   ├── predict.ts           # Prediction proxy + cache
│       │   └── simulate.ts          # Game session management
│       ├── services/
│       │   ├── mlClient.ts          # Axios client to ML service
│       │   ├── cache.ts             # Redis cache layer
│       │   └── gameImport.ts        # Import orchestration
│       ├── middleware/
│       │   └── errorHandler.ts      # Global error handler
│       └── types/
│           └── index.ts             # Shared TypeScript types
│
├── frontend/                        # React SPA
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── nginx.conf                   # Nginx config for Docker container
│   ├── package.json
│   ├── vite.config.ts               # Vite + API proxy
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx                 # React + QueryClient entry
│       ├── App.tsx                  # Multi-phase flow (welcome → setup → game/replay/practice)
│       ├── vite-env.d.ts            # Vite type declarations
│       ├── api/
│       │   └── client.ts           # Axios API wrapper
│       ├── data/
│       │   └── openings.ts         # 29 opening definitions (ECO, moves, descriptions)
│       ├── store/
│       │   ├── gameStore.ts         # Chess state + time control + opening practice (Zustand)
│       │   ├── playerStore.ts       # Player + style state
│       │   └── replayStore.ts       # Replay mode state + forking
│       ├── hooks/
│       │   ├── useChessGame.ts      # Board interaction hook
│       │   ├── usePrediction.ts     # Auto-prediction with time control
│       │   ├── usePlayerProfile.ts  # Player profile hook
│       │   ├── useEvaluation.ts     # Position evaluation hook
│       │   ├── useSoundEffects.ts   # Move/capture sound effects
│       │   └── useKeyboardShortcuts.ts  # Keyboard navigation
│       ├── components/
│       │   ├── Welcome/
│       │   │   └── WelcomeScreen.tsx  # Mode selection (Play, Replay, Practice)
│       │   ├── Setup/
│       │   │   └── SetupScreen.tsx  # Pre-game config (color, opponent, time control)
│       │   ├── Board/
│       │   │   ├── ChessBoard.tsx   # Responsive board + clocks + arrows
│       │   │   ├── GameClock.tsx    # Chess clock with visual time states
│       │   │   ├── EvalBar.tsx      # Vertical eval indicator
│       │   │   ├── EvalGraph.tsx    # Eval history line graph
│       │   │   └── CapturedPieces.tsx # Material difference display
│       │   ├── Game/
│       │   │   ├── GameScreen.tsx    # Main game layout + auto-predict + realistic think time
│       │   │   ├── GameControls.tsx  # Undo, reset controls
│       │   │   ├── GameOverModal.tsx # Game over dialog
│       │   │   ├── GameImport.tsx    # Username fetch + PGN upload
│       │   │   └── MoveList.tsx      # Scrollable, clickable move pairs
│       │   ├── Player/
│       │   │   ├── PlayerSearch.tsx   # Username search input
│       │   │   ├── PlayerProfile.tsx  # Style bar visualization (handles unavailable stats)
│       │   │   ├── StyleSliders.tsx   # Aggression/risk/blunder
│       │   │   ├── StylePanel.tsx     # In-game style adjustment
│       │   │   └── OpponentBadge.tsx  # Compact opponent display
│       │   ├── Prediction/
│       │   │   ├── PredictionPanel.tsx  # Main prediction display
│       │   │   ├── MoveDistribution.tsx # Bar chart (Recharts)
│       │   │   └── Explainability.tsx   # Deviation reasoning
│       │   ├── Practice/
│       │   │   └── PracticeScreen.tsx   # Opening browser + preview board + settings
│       │   ├── Replay/
│       │   │   └── ReplayScreen.tsx     # Step-through + fork + AI takeover
│       │   ├── Simulation/
│       │   │   ├── SimulationBoard.tsx  # Play-against-AI board
│       │   │   └── SimulationControls.tsx
│       │   └── common/
│       │       ├── Loading.tsx
│       │       └── ErrorBoundary.tsx
│       └── styles/
│           └── global.css           # Tailwind imports + custom styles
│
└── data/                            # Runtime data (gitignored)
    ├── raw/                         # Downloaded PGN files
    ├── processed/                   # HDF5 training data
    ├── stockfish/                   # Stockfish binary
    └── checkpoints/                 # Model weights
```

---

## Testing

### ML Service Tests

```bash
cd ml
pip install -e ".[dev]"
pytest tests/ -v
```

The test suite covers:

- **Move encoding roundtrip** (`test_move_encoding.py`): Verifies every legal move in the starting position, midgame, endgame, and across 50+ positions from a sample game survives `encode → decode` with no data loss. Includes tests for Black moves (mirroring), promotions, and legal move mask correctness.

- **Board representation** (`test_preprocessing.py`): Verifies the tensor shape is (18, 8, 8) float32, that known positions produce expected values (e.g., 8 white pawns on rank 1, king on e1), that the side-to-move channel is consistent after flipping, that castling rights encode correctly, that en passant squares are marked, and that the halfmove clock normalizes properly.

- **Model forward pass** (`test_model.py`): Verifies output shapes for each sub-module (board encoder, sequence encoder, player embedding, fusion, all three heads) and the fully assembled model. Confirms probabilities sum to 1.0, value output is in [-1, 1], and parameter counting works. Tests the three-phase freezing strategy.

- **Sampling pipeline** (`test_sampler.py`): 21 tests covering temperature computation (rating scaling, style overrides, ceiling/floor clamping), move sampling (legal moves, UCI validity, probability bounds, opening book integration, multi-position robustness), style biases (aggression boost), eval perspective flipping, and nucleus sampling (no random queen moves at rating 400 over 100 samples, temperature never exceeds 1.0, top-p rating scaling, tail removal verification).

### Backend Tests

```bash
cd backend
npm install
npm test
```

---

## Evaluation Metrics

The system is evaluated on these metrics (computed by `MetricsTracker` in [ml/src/training/eval_metrics.py](ml/src/training/eval_metrics.py)):

| Metric | Description | Target |
|--------|-------------|--------|
| **Top-1 move-match accuracy** | Does the model's highest-probability move match the human's actual move? | >36% pretrained, >42% per-player |
| **Top-5 move-match accuracy** | Is the human's actual move in the model's top 5 predictions? | >65% |
| **Centipawn loss MAE** | Mean absolute error between predicted and actual CPL | <15 cpl |
| **Blunder AUC-ROC** | Binary classification performance for blunder detection | >0.80 |
| **Value prediction MAE** | Mean absolute error of position evaluation | Minimize |

Human move prediction has a theoretical accuracy ceiling around ~50% top-1 (humans are noisy decision-makers). The key quality metric is whether the predicted *distribution* matches the observed move distribution, measured by KL divergence across a test set.

Behavioral tests also verify that:
- Aggressive player profiles produce more captures and checks.
- Lower-rated profiles produce higher blunder probabilities.
- Style sliders shift the output distribution in the expected direction.

---

## Comparison to Chess Engines

| Dimension | AlphaZero / Leela / Stockfish | Move Predictor |
|-----------|-------------------------------|----------------|
| **Objective** | Find the objectively best move | Predict the move a human would play |
| **Search** | MCTS (AlphaZero/Leela) or alpha-beta (Stockfish) with thousands of node evaluations | Single forward pass, no search |
| **Training signal** | Self-play (AlphaZero/Leela) or handcrafted eval (Stockfish) | Supervised learning on human game data |
| **Player awareness** | None — plays identically regardless of opponent | Per-player embeddings capture individual style, rating, tendencies |
| **Error modeling** | None — assumes perfect play on both sides | Explicit centipawn loss and blunder probability prediction |
| **Move selection** | Deterministic best move | Probabilistic sampling with skill-aware temperature |
| **Inference speed** | Seconds (MCTS requires many evaluations) | <200ms per move (single forward pass + Stockfish comparison) |
| **Output** | Single best move | Full probability distribution over all legal moves + explainability |
| **Use case** | Competitive play, analysis | Training tools, opponent simulation, game prediction, coaching |

**Why not just degrade engine output?** You might think: take Stockfish's top-5 moves and add noise proportional to rating. This fails because human mistakes are *structured*, not random. A 1200-rated player doesn't randomly blunder — they systematically miss backward-rank threats, miscalculate exchanges involving more than 2 pieces, and have strong preferences for familiar opening lines. These patterns require a model trained on human data, not degraded engine output.

---

## Technical Decisions and Tradeoffs

**ResNet over Vision Transformer for the board encoder.** The 8x8 grid is far below the resolution where ViTs excel. At this scale, the convolutional inductive bias (local receptive fields, parameter sharing) is strictly beneficial. Maia-1 and Maia-2 both validated this choice empirically. A ViT would need significantly more data and computation to match.

**1,858-index move vocabulary over 4,096 from-to encoding.** A flat 64x64 from-to scheme cannot distinguish underpromotions (e7e8=Q vs e7e8=R share the same from-to pair). The 1,858-index Leela/Maia scheme handles all legal move types including underpromotions, is well-tested in production models, and produces a manageable softmax output. The theoretical maximum is 4,672 entries (64 squares × 73 move types), but pruning illegal combinations (e.g., queen-like moves from rank 8 going further north) reduces this to 1,858.

**HTTP between Node.js and Python over gRPC.** FastAPI generates OpenAPI docs automatically, debugging is trivial with standard HTTP tools, and the 1-2ms overhead is negligible compared to the 50-200ms model inference. gRPC can be swapped in later if throughput demands it — the service boundary is clean.

**HDF5 over SQLite/Parquet for training data.** HDF5 supports memory-mapped random access to large tensors without loading everything into RAM. It is the standard format for ML training data that includes multi-dimensional arrays. Parquet would require additional serialization for the (18, 8, 8) board tensors.

**Zustand over Redux for frontend state.** The app has medium complexity (3 stores, ~20 state fields). Zustand eliminates Redux's boilerplate (action types, reducers, selectors) while providing the same features. At this scale, the simpler API is a net win.

**Separate Node.js gateway over direct FastAPI exposure.** The gateway handles concerns that don't belong in the ML service: Redis caching, rate limiting, request validation (Zod), PGN file uploads (Multer), and game session management. This keeps the ML service focused on inference and lets each service scale independently.

---

## Future Improvements

- **Elo-conditioned generation**: Train a single model that conditions on an explicit ELO input (similar to Maia-2's skill-aware approach) rather than learning separate per-player embeddings, enabling instant simulation at any rating without fine-tuning.
- **MCTS hybrid**: For higher-quality predictions, combine the neural policy with a lightweight search (100-200 nodes) to improve accuracy while maintaining human-like play.
- **WebSocket support**: Replace polling with WebSocket connections for real-time move updates during simulation games.
- **Model distillation**: Distill the full model into a smaller student network (<2M parameters) for client-side inference via ONNX.js, eliminating server round-trips.
- **Tournament mode**: Support multi-game matches with per-game statistics, tracking how the simulated opponent adapts (or doesn't) across games.
- **Endgame tablebase**: Integrate Syzygy tablebases for perfect endgame play, transitioning from human-like to engine-correct when the position is fully solved.
- **Adaptive difficulty**: Dynamically adjust the simulated opponent's rating during a game based on the player's performance, creating a more engaging experience.
