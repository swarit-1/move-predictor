# Move Predictor — Human-Aware Chess AI

A behavioral chess model that predicts what move a **human** will play, not the optimal engine move. Models deviation from optimal play and simulates specific real-world opponents based on their historical games.

## Architecture

```
Frontend (React)  →  Node.js Gateway (:3000)  →  Python ML Service (:8000)
                                                    ├── PyTorch Model (ResNet + Transformer)
                                                    ├── Stockfish Pool
                                                    └── PostgreSQL + Redis
```

### Neural Network Model (~8.6M parameters)

| Component | Architecture | Output |
|-----------|-------------|--------|
| Board Encoder | 15-block ResNet, 256 channels | (B, 256) |
| Sequence Encoder | 4-layer Transformer, 8 heads | (B, 256) |
| Player Embedding | Learned per-player + continuous stats | (B, 128) |
| Fusion Layer | Skill-aware gating | (B, 512) |
| Policy Head | Linear → 1968 moves | Move probabilities |
| Value Head | Linear → [-1, 1] | Position evaluation |
| Error Head | Linear → (CPL, blunder) | Human error prediction |

### Key Differentiator: Skill-Aware Sampling

Instead of `argmax`, moves are sampled with temperature modulated by:
- Predicted centipawn loss
- Blunder probability
- Player rating
- User-adjustable style sliders (aggression, risk, blunder frequency)

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker & Docker Compose (optional)

### Option 1: Docker

```bash
docker compose up --build
```

### Option 2: Local Development

```bash
# Install dependencies
make setup

# Start PostgreSQL and Redis
docker compose up postgres redis -d

# Start all services
make dev
```

### Option 3: Individual Services

```bash
# ML Service
cd ml && pip install -e ".[dev]" && uvicorn src.main:app --reload --port 8000

# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Data Pipeline

```bash
# 1. Download Stockfish
make download-stockfish

# 2. Fetch games from Lichess
cd ml && python scripts/fetch_lichess_data.py <username> --max-games 500

# 3. Preprocess into training data
cd ml && python scripts/preprocess_corpus.py data/raw/ --output data/processed/train.h5

# 4. Train the model
cd ml && python scripts/train.py --phase 1 --epochs 20
```

## API Endpoints

### Backend Gateway (:3000)

| Endpoint | Description |
|----------|-------------|
| `POST /api/predict` | Get human move prediction |
| `POST /api/games/import` | Fetch games by username |
| `POST /api/games/upload` | Upload PGN file |
| `POST /api/players/build-profile` | Build player style profile |
| `POST /api/simulate/start` | Start simulation game |
| `POST /api/simulate/:id/move` | Play a move in simulation |

### ML Service (:8000)

| Endpoint | Description |
|----------|-------------|
| `POST /ml/predict` | Raw model inference |
| `POST /ml/analyze` | Stockfish analysis |
| `POST /ml/player/build-profile` | Build player embedding |
| `POST /ml/training/start` | Start training job |

## Training Phases

1. **Phase 1 — Pretrain**: Large corpus, rating-bucket embeddings, lr=1e-3
2. **Phase 2 — Fine-tune**: Per-player embeddings, partially frozen encoder, lr=1e-4
3. **Phase 3 — Few-shot**: New player adaptation, only embedding trainable

## Project Structure

```
move-predictor/
├── ml/                 # Python ML service (FastAPI + PyTorch)
│   ├── src/
│   │   ├── models/     # Neural network (ResNet, Transformer, heads)
│   │   ├── data/       # Data pipeline (ingestion, preprocessing, dataset)
│   │   ├── training/   # Training loop, losses, metrics
│   │   ├── inference/  # Sampler, pipeline, explainability
│   │   ├── engine/     # Stockfish pool
│   │   └── api/        # FastAPI endpoints
│   ├── scripts/        # CLI tools (fetch, preprocess, train)
│   └── tests/
├── backend/            # Node.js API gateway (Express + TypeScript)
├── frontend/           # React SPA (Vite + Tailwind)
└── data/               # Data storage (gitignored)
```

## How It Differs from Chess Engines

| | Chess Engines | Move Predictor |
|---|---|---|
| **Goal** | Find best move | Predict human move |
| **Search** | MCTS / alpha-beta | Single forward pass |
| **Training** | Self-play | Human game data |
| **Player awareness** | None | Per-player embeddings |
| **Error modeling** | None | CPL + blunder prediction |
| **Output** | Single best move | Probability distribution |

## Running Tests

```bash
# ML service tests
cd ml && pytest tests/ -v

# Backend tests
cd backend && npm test
```
