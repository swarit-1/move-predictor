# Move Predictor — Product Requirements Document

> **Version:** v1.0 (audit + roadmap)
> **Status:** Pre-launch, pre-funding (YC Startup School 2026)
> **Author:** Repository audit, May 2026
> **Owner:** Swarit Srivastava
> **Repo:** `move-predictor` (monorepo: `frontend/` React + Vite, `backend/` Node/Express, `ml/` Python/FastAPI/PyTorch)

---

## 0. TL;DR for a YC Presentation

**One-line pitch:** *"Stockfish tells you the best move. Move Predictor tells you the move that **your opponent** is about to play."*

We are building the chess equivalent of a stylometric language model. Instead of finding the objectively optimal move, the product fetches a real player's games from Lichess or Chess.com, builds a behavioral fingerprint, and plays moves the way *that specific person* would, including their characteristic mistakes.

**Why it matters:**
1. **Preparation.** Every tournament player wants to study how their next opponent will play 1. e4. Engines can't help — engines play perfect, opponents don't.
2. **Coaching.** Trainers can show students *exactly* the kind of mistake the student keeps making and the position type that triggers it.
3. **Practice.** You can play a 50-game match against "Magnus" or "your toxic 1400 club rival" and feel the actual shape of their game.

**What exists today:**
- A working full-stack product (React, Node gateway, Python ML, Postgres, Redis, Stockfish pool).
- A complete neural-network architecture (ResNet + Transformer + player-embedding + multi-head policy/value/error) — built, importable, unit-tested.
- A live prediction pipeline that fetches real human move distributions from the Lichess Opening Explorer per rating bracket and per Lichess player.
- A per-player opening-book trie built from up to 5,000 of their recent games.
- A Stockfish-grounded fallback with seven blind-spot biases (tactical blindness, material greed, check attraction, king-attack neglect, etc.) modulated by rating.

**What does NOT exist today (this PRD is the plan to fix it):**
- The trained model. `data/checkpoints/` is empty. **100% of production predictions today come from the explorer/Stockfish/heuristic fallback path**, not the neural network. The README implies the model is trained; it is not.
- Per-player fine-tuning. Phase 3 of the training plan is documented but has never been executed. There is no pipeline that takes a player's PGN dump and produces a personalized checkpoint.
- Persistence of built player profiles. When the ML service restarts or the user refreshes the browser, every selected opponent disappears. This is the **"player not found after refresh"** bug.
- A safe premove path. Under premove bursts the prediction loop, Stockfish pool, and Lichess explorer rate limits collide and the game hangs.
- Style dimensionality. The user-facing model has **three sliders** (aggression / risk-taking / blunder frequency). The internal stats vector has 25 dimensions, most of which are computed but never surfaced or used by the sampler.

This PRD enumerates the gap, prioritizes the fixes, and lays out the technical roadmap.

---

## 1. Product Vision and Positioning

### 1.1 What the product is

Move Predictor is a **personalized chess opponent simulator**. The user selects a specific human player — by Lichess or Chess.com username — and plays against an AI clone of that person, calibrated to their actual rating, opening repertoire, blunder patterns, and stylistic tendencies. The user can:

- **Play live games** against the clone.
- **Adjust style sliders** to make the clone more/less aggressive, more/less prone to blunders, more/less consistent.
- **Review the game afterward** with full move-by-move analysis (CPL, blunders, deviations from the engine line, deviations from the clone's typical move).
- **Practice openings** by replaying a target opening and seeing how the clone responds in that opening.
- **Save games** to their account for later replay.

### 1.2 What the product is NOT

- Not a chess engine. Stockfish is the gold standard for that, and Stockfish ships in this repo only as ground truth for analysis and as a fallback distribution.
- Not Lichess/Chess.com. We sit on top of their data and add a personalization layer they don't provide.
- Not a general AI agent.

### 1.3 Why it's defensible

Three moats, in order of strength:

1. **The per-player corpus.** Every active user creates an embedding from their or their opponent's game history. The more players we model, the better cross-player priors get (Maia-2 paper validates this). This is a data-network effect.
2. **The humanization model.** Maia-2 achieved ~50% top-1 move-match accuracy by training a dedicated human-prediction model. Engine output degraded to a target rating only achieves ~35%. Our architecture mirrors Maia-2 (ResNet board encoder + Transformer history + player embedding + skill-aware sampling) but adds a player-specific opening book trie and Lichess Opening Explorer integration as a runtime prior. **This is implemented but not yet trained.**
3. **The "everyone is a known player" thesis.** Chess.com and Lichess have ~150M registered users with public game histories. Anyone with ~50 rated games has enough data to model. This is the largest stylometric corpus in any domain that we know of.

### 1.4 Comparable prior art

| Project | What they did | What we add |
|---|---|---|
| **Maia Chess** (UToronto, 2020) | Trained ResNets at fixed rating bands (1100/1500/1900). Best public human-move predictor at the time. | Per-player personalization, opening book, runtime style controls, blind-spot biases for cognitive errors, time-pressure modeling. |
| **Maia-2** (2024) | Single model, continuously skill-aware via a skill-encoded gating mechanism. ~50% top-1 acc. | Same skill-aware fusion principle, but with explicit player embedding + 25-dim stats + per-player opening book + UI/UX. |
| **Stockfish** | Search-based superhuman engine. | We *use* Stockfish for evaluation and as a humanization-fallback ceiling, not as the primary policy. |
| **Lichess** | Hosts the world's largest public chess game DB. Provides the Opening Explorer and Player Explorer APIs that we depend on. | Build the personalization layer on top. |

---

## 2. Current Implementation — Honest Audit

This section is the "information dump" of the codebase. Everything here was read directly from the source on the day of this PRD. Any disagreement between this document and the README — trust this document.

### 2.1 Repository layout

```
move-predictor/
├── frontend/          React 18 + Vite + Tailwind + Zustand + react-chessboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/  (Auth, Board, Game, Player, Practice, Prediction, Replay, Review, Setup, Simulation, Welcome, common)
│   │   ├── hooks/       (useChessGame, useEvaluation, usePlayerProfile, usePrediction, useSoundEffects, useKeyboardShortcuts)
│   │   ├── store/       (authStore, gameStore, playerStore, replayStore, reviewStore, savedGamesStore)
│   │   └── api/client.ts
│   └── nginx.conf       (prod gateway)
│
├── backend/           Node 20 + Express + TypeScript + Prisma + Zod + Redis client
│   ├── prisma/schema.prisma   (User, SavedGame)
│   └── src/
│       ├── index.ts
│       ├── middleware/        (auth JWT, errorHandler)
│       ├── routes/            (auth, games, players, predict, savedGames, simulate)
│       └── services/          (cache (Redis), gameImport, mlClient)
│
├── ml/                Python 3.11 + FastAPI + PyTorch + python-chess + httpx + SQLAlchemy
│   ├── src/
│   │   ├── main.py           (FastAPI lifespan, router wiring)
│   │   ├── config.py         (Pydantic settings — env-backed)
│   │   ├── api/              (health, predict, analyze, players, training, review)
│   │   ├── data/
│   │   │   ├── sources/      (lichess.py, chesscom.py, pgn_loader.py)
│   │   │   ├── preprocessing.py
│   │   │   ├── feature_extraction.py
│   │   │   ├── dataset.py
│   │   │   ├── player_stats.py
│   │   │   ├── opening_book.py
│   │   │   └── lichess_explorer.py
│   │   ├── models/           (board_encoder, sequence_encoder, player_embedding, fusion, heads, move_encoding, move_predictor)
│   │   ├── inference/        (pipeline, sampler, blind_spots, explainability)
│   │   ├── engine/           (stockfish_pool, analysis)
│   │   ├── db/               (SQLAlchemy models, session, crud)
│   │   └── training/         (trainer, losses, eval_metrics)
│   ├── scripts/              (download_lichess_data, fetch_lichess_data, preprocess_corpus, train, train_rating_bracket.sh, train_all_brackets.sh, create_demo_checkpoint, smoke_test_humanization)
│   └── tests/                (model, preprocessing, move_encoding, blind_spots, sampler)
│
├── data/              EMPTY (raw/, processed/, checkpoints/, stockfish/) — no trained artifacts on disk
├── docker-compose.yml
├── Makefile
└── README.md
```

### 2.2 Services and ports

| Service | Port | Tech | Role |
|---|---|---|---|
| Frontend | 5173 (dev), 80 (nginx prod) | Vite + React | UI, board, sliders, game state |
| Backend | 3001 | Node/Express | API gateway, auth, rate limiting, validation, Redis cache, proxies to ML |
| ML | 8000 | FastAPI/Python | Predictions, profile building, game review, Stockfish pool |
| Postgres | 5432 | PG16 | App users, saved games (Prisma), ML players/games/runs (SQLAlchemy) |
| Redis | 6379 | Redis 7 | Prediction cache, Stockfish cache, future profile cache |

**Two schemas, one Postgres:** Backend uses Prisma to manage `app_users` and `app_saved_games`. ML uses SQLAlchemy on the same DB for its own tables. This is intentional (per README) but is a footgun — if either side drops/migrates, the other's tables can be clobbered. Migrations are not coordinated. Future work: split DBs or namespace migrations rigorously.

### 2.3 Frontend state (Zustand stores)

| Store | Persisted? | Notes |
|---|---|---|
| `authStore` | ✅ JWT in `localStorage` under key `mp_token`; rehydrates via `/auth/me` | The only correctly persisted store. |
| `playerStore` (`opponent`, `styleOverrides`) | ❌ | **This is the cause of the "player not found after refresh" bug.** |
| `gameStore` | ❌ | The current game, FEN, move history, premove, clock — all in memory. Refresh blows the game away. |
| `replayStore`, `reviewStore`, `savedGamesStore` | ❌ | Reload on demand. Less critical. |

### 2.4 ML service — what the prediction pipeline actually does

The full predict flow on every move:

1. Backend `POST /api/predict` validates input via Zod and forwards to ML `POST /ml/predict`.
2. ML `predict_move` (in `ml/src/api/predict.py`):
   - Parses FEN, rejects if invalid or game over.
   - Builds `StyleOverrides` from the three slider values.
   - Calls Stockfish via the pool for ground-truth `engine_best` + top-5 lines (non-blocking; absence is tolerated).
   - Computes `time_pressure` from remaining clock vs initial.
   - Calls `prediction_pipeline.predict(...)`.
3. `prediction_pipeline.predict` (in `ml/src/inference/pipeline.py`):
   - Looks up the player's stored stats vector in the in-memory dict `self.player_stats[player_key]`.
   - Derives `StyleOverrides` from the stats if not explicitly given.
   - Looks up the player's `OpeningBook` and queries it for move probabilities at the current move history.
   - **Branches:**
     - `_predict_with_model` if `self.has_checkpoint == True`.
     - `_predict_with_data` otherwise.
4. `_predict_with_data` (the **only path that runs in production today**):
   - Step A: queries Lichess Opening Explorer at the player's rating bracket.
   - Step B: if Lichess player, queries Lichess Player Explorer for personal stats at this exact position.
   - Step C: picks the highest-quality source available:
     - Player explorer (if ≥5 games) → temperature-soft sampling, blind spots OFF.
     - Player's own opening book trie (if ≥2 moves there) → blind spots OFF.
     - Aggregate rating-bucket explorer (if ≥20 games) → blind spots ON.
     - Internal Stockfish call → `_build_stockfish_logits` heuristic → blind spots ON.
   - Step D: estimates CPL/blunder from the player's stats (if computed from `[%eval]` annotations on Lichess) or from the rating-based formula.
   - Step E: calls `sample_move`:
     - Mixes opening book priors into logits.
     - Applies aggression bias.
     - Applies seven blind-spot biases (rating-scaled).
     - Masks illegal moves.
     - Temperature scales.
     - Nucleus (top-p) filter.
     - Min-probability floor (rating-dependent).
     - Argmax for very strong players above a probability threshold; multinomial otherwise.

**Where the neural network would slot in:** the `_predict_with_model` branch. It is fully implemented, unit-tested, and unused at runtime because no checkpoint has been trained or shipped.

### 2.5 Build-profile flow — what "training against someone's games" actually does today

This is where the user's question lives. Currently:

1. User enters a username and source (Lichess or Chess.com), optionally a time control.
2. Backend `POST /api/players/build-profile` proxies to ML `POST /ml/player/build-profile`.
3. ML:
   - Calls the appropriate source client to get the player's profile (for the authoritative rating per time control).
   - Streams down up to 200 PGNs (configurable up to 5,000), filtered by `perfType` (Lichess) or `time_class` (Chess.com).
   - Lichess PGNs include `[%eval X.XX]` annotations when `evals=true` is set — we use these to compute true CPL and blunder rate.
   - Chess.com PGNs **do not include eval annotations**. For Chess.com players, CPL and blunder rate fall back to default (50.0 / 0.05). Accuracy is reported as `-1` in the UI.
   - Computes a `PlayerStats` dataclass with 25 fields (see §2.7).
   - Builds an `OpeningBook` trie indexing every game up to move 15.
   - Loads the nearest-bracket bracket checkpoint (currently none exist) via `load_model_for_rating(rating)`.
   - Stores `opening_books[player_key]`, `player_stats[player_key]`, `player_time_controls[player_key]` **in process memory only**.
4. Returns a `PlayerProfile` with `player_key` (e.g. `"lichess:DrNykterstein"`), `opening_book_size`, `ratings_by_time_control`, etc.

**This is what "training against someone's games" means in the current product:**
- Computing a 25-dim feature vector. *(Not training. Feature extraction.)*
- Building an opening book trie. *(Not training. A keyed prefix tree.)*
- Querying an external API in real time. *(Not training. Retrieval.)*

There is **no gradient step, no fine-tuning, no checkpoint produced.** The "training pipeline" in `ml/scripts/train.py` and `ml/src/training/trainer.py` exists, supports three phases (pretrain / fine-tune / few-shot per-player), and has never been run end-to-end.

### 2.6 How we get data from Chess.com (the user asked specifically)

The user said *"they don't exactly have an API."* **They do.** Chess.com publishes the [Published Data API](https://www.chess.com/news/view/published-data-api). It is unauthenticated, no API key, requires only a descriptive `User-Agent` header. We use three endpoints in `ml/src/data/sources/chesscom.py`:

| Endpoint | Used for | Code |
|---|---|---|
| `GET /pub/player/{username}` | Profile metadata (title, country, etc.) | `fetch_player_profile` |
| `GET /pub/player/{username}/stats` | Per-time-class ratings (chess_bullet, chess_blitz, chess_rapid, chess_daily) — we map `classical → daily` because Chess.com uses "daily" for correspondence. | `fetch_player_stats`, `fetch_all_ratings` |
| `GET /pub/player/{username}/games/archives` then per-month `GET {archive_url}` | Monthly game archives in PGN form | `fetch_player_games` |

We iterate archives newest-first, filter to rated games matching the requested `time_class`, and stop at `max_games`.

**What we get from Chess.com that we don't get from Lichess:**
- Full Chess.com rating per time class (often differs significantly from the player's Lichess rating).
- Game results, opponent identity, time control.

**What we DON'T get from Chess.com that we DO get from Lichess (this is the asymmetry to fix):**
- `[%eval]` annotations on each move → can't compute CPL / blunder rate without our own Stockfish pass.
- A "Player Explorer" API → there is no equivalent to `https://explorer.lichess.ovh/player`. For Lichess players we can query their personal frequency of every move in every position. For Chess.com players we have **only** the opening book we build locally from their PGNs.

**Implication for product quality:** the simulation of a Chess.com player is currently weaker than the simulation of a Lichess player. Fixing this is in §5.3.

### 2.7 The 25-dim player stats vector

Computed in `ml/src/data/player_stats.py` from PGNs. The full list:

| # | Field | What it measures | Normalization |
|---|---|---|---|
| 0 | `rating` | Authoritative rating from source API | / 3000 |
| 1 | `num_games` | Sample size | min(n/1000, 1) |
| 2 | `avg_centipawn_loss` | Lichess `[%eval]` derived | min(cpl/200, 1) |
| 3 | `blunder_rate` | Fraction of moves > 100 cp loss | 0–1 |
| 4 | `aggression_index` | `min(2 × tactical_tendency, 1)` | 0–1 |
| 5 | `tactical_tendency` | (captures + checks) / total moves | 0–1 |
| 6 | `opening_diversity` | unique first moves / total games | 0–1 |
| 7 | `endgame_accuracy` | Endgame conversion proxy | 0–1 |
| 8 | `avg_move_time` | If clock data available | min(t/120, 1) |
| 9 | `time_pressure_tendency` | Currently always 0 (not yet implemented) | 0–1 |
| 10 | `consistency` | `1 - var(per_game_capture_rate) × 20` | 0–1 |
| 11 | `win_rate` | wins / total games | 0–1 |
| 12 | `draw_rate` | draws / total games | 0–1 |
| 13 | `avg_game_length` | Mean fullmove number at end | min(g/100, 1) |
| 14 | `e4_ratio` | % games starting 1.e4 | 0–1 |
| 15 | `d4_ratio` | % games starting 1.d4 | 0–1 |
| 16 | `other_opening_ratio` | 1 - e4 - d4 | 0–1 |
| 17 | `piece_activity` | % moves to central / extended-center squares | 0–1 |
| 18 | `king_safety_preference` | castle rate + (1 - king move rate × 10) | 0–1 |
| 19 | `pawn_structure_care` | non-capture pawn pushes / pawn moves | 0–1 |
| 20 | `exchange_tendency` | recaptures / total moves × 10 | 0–1 |
| 21 | `endgame_conversion` | Endgame win/draw rate from winning material | 0–1 |
| 22 | `opposite_color_bishop_skill` | Never computed (always 0.5) | 0–1 |
| 23 | `rook_endgame_skill` | Never computed (always 0.5) | 0–1 |
| 24 | `pawn_endgame_skill` | Never computed (always 0.5) | 0–1 |

**Three of these (22, 23, 24) are placeholders that never get values.** They have no PGN extraction code, just defaults from the dataclass.

The model architecture is wired to consume all 25, but the sampler currently only reads three: aggression (#4), blunder_rate (#3), and inverse-consistency (#10).

### 2.8 The blind-spot bias system

This is one of the more interesting pieces of the product. Seven biases, scaled by `weakness = max(0, (2400 - rating) / 1800)` and amplified by `time_pressure`:

| Bias | What it does | Strength formula |
|---|---|---|
| Tactical blindness | Penalizes quiet engine-best moves, especially discovered attacks | `0.80 × weakness × (1 + 0.4 × pressure)` |
| Material greed | Boosts captures by piece value, especially undefended targets | `0.60 × weakness × …` |
| Check attraction | "Patzer sees a check, patzer gives a check" | `0.45 × weakness × …` |
| Piece preference | Bias toward queen and centralized knights, away from rooks | `0.30 × weakness × …` |
| King-safety neglect | Penalizes non-castling moves when castling is available | `0.50 × weakness × …` |
| Long-range blindness | Penalizes 4+ square slider moves humans typically miss | `0.70 × weakness × …` |
| King-attack neglect | Penalizes retreating from a pressured king | `0.55 × weakness × …` |

These are applied to logits **before** temperature/top-p, so they "push" specific human-shaped mistakes into the nucleus while leaving garbage moves outside.

This system is unique to this codebase — neither Maia nor Maia-2 expose explicit cognitive-error structures.

### 2.9 The Stockfish pool

`ml/src/engine/stockfish_pool.py` runs **4 parallel Stockfish processes** (configurable via `STOCKFISH_POOL_SIZE`), each at `depth=18` (configurable). Used for:

- `analyze` endpoint (full position evaluation).
- `review` endpoint (whole-game CPL pass).
- `predict` endpoint engine top-5 (best-effort, non-blocking).
- Internal fallback when no Lichess Opening Explorer data exists.

Stockfish results are cached in Redis for 24 h.

### 2.10 Tests

`ml/tests/` covers:
- `test_model.py` — forward pass shape checks
- `test_preprocessing.py` — board tensor encoding
- `test_move_encoding.py` — UCI ↔ move-index round trip
- `test_blind_spots.py` — bias deltas land on expected moves
- `test_sampler.py` — temperature and top-p behavior

No tests for `predict_with_data`, no tests for the data sources (Lichess/Chess.com clients are unmocked), no tests for `build_player_profile`, no integration tests for the prediction pipeline. **The most important untested path is exactly the path that serves 100% of production predictions today.**

### 2.11 CI

`.github/workflows/ci.yml` runs `pytest` on ML, `npm test` on backend, and `tsc --noEmit` on frontend. There are no UI tests, no end-to-end tests.

---

## 3. Critical Bugs and Defects (prioritized)

### 3.1 P0 — "Player not found after refresh" + "premove hang locks the page"

**Symptoms (as reported by user):**
1. After heavy premove activity the page hangs.
2. After refreshing, no player profile can be loaded — the system claims the player can't be found, even for usernames that loaded fine seconds ago.

**Root causes (three layers, all reinforcing each other):**

**Layer 1: Frontend has no persistence for player or game state.**
- `frontend/src/store/playerStore.ts:51` creates the store with raw `create()` — no `persist` middleware. On refresh, `opponent` reverts to `null` and `styleOverrides` resets to default.
- `frontend/src/store/gameStore.ts:118` does the same: no persistence. The current FEN, move history, premove, and clock state are lost.
- **Even though `player_key` would let us reattach to a still-cached profile in the ML service, the frontend has no idea what `player_key` to send because it's gone.**

**Layer 2: ML service stores player state in process memory only.**
- `ml/src/inference/pipeline.py:48`: `self.opening_books: dict[str, OpeningBook] = {}` — a singleton attribute on `prediction_pipeline`.
- Same for `self.player_stats` and `self.player_time_controls`.
- If the ML service restarts (which happens after a hang, since the user kills/restarts), all profiles vanish. If the ML service is ever horizontally scaled, requests routed to a different worker miss the cache entirely.
- There is no Redis or Postgres write-through for built profiles.

**Layer 3: The premove storm breaks the prediction loop in three ways.**

1. **No concurrency control on the ML side.** `prediction_pipeline.predict` is async but mutates the model state via `load_model_for_rating()` whenever `build_player_profile` is called. Concurrent profile builds can race-load a different rating bracket mid-inference for another request.

2. **Lichess Opening Explorer rate limiting and 5-second timeout.** `ml/src/data/lichess_explorer.py:53` uses `timeout=5.0`. Under premove storms (one prediction per premove, fired the instant `applyPredictedMove` runs), the explorer 429s or times out, returning empty. The fallback chain kicks in and eventually hits Stockfish — but only 4 Stockfish workers exist. Requests queue up. The frontend's axios timeout is 30 s. When that fires, prediction never lands, `applyPredictedMove` never runs, the queued premove never executes, and the UI stays frozen on "Opponent thinking…".

3. **Frontend prediction guard suppresses retries.** `frontend/src/hooks/usePrediction.ts:13`:
   ```ts
   if (isLoading) return;
   ```
   Combined with the `useEffect` in `GameScreen.tsx:138` that auto-fires on `moveHistory.length` changes, if a request errors *while* `isLoading=true` was briefly held, subsequent triggers within the same render batch are dropped silently. The user sees no error, just a frozen turn indicator. They refresh — and then Layer 1 hits.

**Fix plan (Section §6.1).** Short version:
- Add `persist` middleware to `playerStore` and `gameStore` (sessionStorage).
- Mirror built profiles to Redis on the ML side, keyed by `player_key`, TTL 24 h.
- Rehydrate profile from Redis on first predict request if the in-memory cache is cold.
- Add a single-flight per-player lock on `build_player_profile`.
- Add a mutex around `load_model_for_rating` (single global, since the model singleton is shared).
- In the frontend, replace `if (isLoading) return;` with an abortable request: if a new prediction is requested while one is in flight, cancel the old one (`AbortController`).
- Add a deferred premove queue: only accept one queued premove; subsequent attempts replace the queued one rather than chaining.

### 3.2 P0 — No trained model in production

`data/checkpoints/` is empty. Every production prediction runs through `_predict_with_data` (explorer + Stockfish + heuristic). The product works — but the moat (the neural network) is dormant.

**Implication:** for any position not in the Lichess Opening Explorer (which is roughly anywhere past move 12, in any non-mainline opening), the model degrades to "Stockfish output blurred by hand-coded biases." That's the same humanization technique chess.com has used for years, and it's strictly weaker than Maia-style learned policies.

**Fix plan (§6.2).** Run Phase 1 pretrain on a Lichess 2019-2023 corpus filtered to a target rating bracket; ship eight bracket checkpoints (400-800 / 800-1000 / … / 2200-2500).

### 3.3 P1 — No per-player fine-tuning

Phase 3 (few-shot per-player) is documented in `ml/src/training/trainer.py:62` (`setup_for_phase3` freezes everything except the player embedding) but never invoked. There is no API endpoint that says "given user X's PGNs, fine-tune embedding row N." There is no per-user checkpoint storage.

**Fix plan (§6.3).** Build the personalize-this-player pipeline: kick off a 50-game fine-tune job, store the resulting embedding row in Postgres keyed by `player_key`, swap it in at inference time.

### 3.4 P1 — Only 3 style sliders visible; only 3 stats used at sampling time

UI exposes `aggression`, `risk_taking`, `blunder_frequency`. Sampler reads only `aggression_index`, `blunder_rate`, `consistency` from the 25-dim vector. The other 22 features feed only the (untrained) neural network.

**Fix plan (§5.2).** Expand to 10 actionable sliders driven by computed stats. Persist user-overridden values.

### 3.5 P2 — Chess.com simulation quality is structurally lower than Lichess

No `[%eval]` annotations → no CPL / blunder rate without local Stockfish pass.
No personal Player Explorer endpoint → no per-player query at any FEN.

**Fix plan (§5.3).** Run Stockfish over Chess.com PGNs at profile-build time (cap at depth 12 to stay within minutes); index every position from every fetched game into a "personal explorer" trie keyed by position-hash → moves played.

### 3.6 P2 — Style derivation reads wrong index

`ml/src/inference/pipeline.py:619` (`_stats_to_style`):
```python
aggression = float(stats[4]) * 100.0           # aggression_index is 0-1
blunder_frequency = float(stats[3]) * 100.0    # blunder_rate is 0-1
```
Index 4 IS `aggression_index` in the vector, so that's correct. Index 3 IS `blunder_rate`. Correct. But the docstring claims index 10 is `consistency`, which it is — and `(1 - consistency) * 100` for `risk_taking` is reasonable. **However, the inverse-consistency mapping is brittle**: a player with low variance because they always play boring positional chess and a player with low variance because they always play wild attacks both get the same low risk-taking. We need a dedicated risk metric (cross-game eval volatility, sacrifices played).

### 3.7 P2 — Inconsistent time-control mapping

Lichess perf names: `bullet`, `blitz`, `rapid`, `classical`.
Chess.com `time_class` values: `bullet`, `blitz`, `rapid`, `daily`.
We canonicalize `classical → daily` for Chess.com (`ml/src/data/sources/chesscom.py:25`) — but Chess.com `daily` is correspondence (multi-day per move), which is a fundamentally different game than OTB classical. This conflation can hand back a 2200 daily rating for a player whose blitz rating is 1500, and the simulation will then play "as a 2200" while the user expected a classical-tempo blitz opponent.

**Fix plan:** never alias `classical → daily`. If the user picks Chess.com + Classical, return "Chess.com has no classical time class; choose Rapid or Daily." Show a tooltip.

### 3.8 P3 — Two-DB-one-Postgres footgun

Prisma and SQLAlchemy share the same database with no migration coordination. A `prisma migrate reset` would drop ML tables. Documented (README §"Two schemas, one Postgres") but not enforced.

**Fix plan:** Split into two databases (`appdb`, `mldb`) in docker-compose and config.

### 3.9 P3 — `app.listen(PORT)` reads `process.env.BACKEND_PORT` but config exports `config.port`

`backend/src/index.ts:16` uses `process.env.BACKEND_PORT || "3001"`. `backend/src/config.ts` likely already handles env parsing centrally. Minor cleanup; one source of truth.

### 3.10 P3 — `playersRouter` search endpoint hard-codes Lichess

`backend/src/routes/players.ts:55-92` queries `https://lichess.org/api/player/autocomplete`. There is no Chess.com autocomplete on this endpoint (and Chess.com doesn't publish one). For Chess.com usernames, the user must type the exact spelling. This is OK as a v1 limitation, but it should be communicated in the UI: "Autocomplete is Lichess-only."

### 3.11 P3 — `frontend/src/store/gameStore.ts:118` instantiates `new Chess()` in the store default

Means `chess` lives across mount/unmount. If the store could be persisted, `Chess` is not JSON-serializable — we'd need a partializer that stores `pgn` and reconstructs `chess` on hydrate. Note this when implementing §6.1.

### 3.12 P3 — `ml/src/api/training.py` `/training/start` is a stub

It records a job ID in an in-memory dict and never trains anything. If the endpoint is hit, the user thinks training started. Either remove the endpoint or wire it to actually trigger a job (Celery, RQ, or even a subprocess for now).

---

## 4. The "More Style Weights" Problem

The user is right that aggression / risk-taking / blunder-frequency are too coarse. Below is the proposed full style taxonomy. The first column is the user-facing slider (or selector); the second is the computed underlying stats; the third is how it modulates the sampler.

### 4.1 Proposed full slider set

| # | Slider / Control | Underlying stats | Sampler effect |
|---|---|---|---|
| 1 | **Aggression** *(existing)* | aggression_index, check rate | Logit boost on captures + checks |
| 2 | **Blunder Frequency** *(existing)* | blunder_rate from `[%eval]` | Scales CPL/blunder estimate → higher temp, looser nucleus |
| 3 | **Risk Taking** *(existing, redefined)* | Eval volatility across games + sacrifice frequency | Wider nucleus, larger style perturbation |
| 4 | **Opening Loyalty** *(new)* | Top-3 opening concentration; novelty rate | Logit boost on book moves; reduces explorer-blending weight |
| 5 | **King Attack Tendency** *(new)* | Frequency of sacrifices targeting enemy king; queenside vs kingside castle attack patterns | Boosts moves that increase attackers-on-king-zone count |
| 6 | **Positional vs Tactical** *(new)* | Quiet move ratio (no capture, no check), avg moves per piece movement | Tilts temperature: tactical players play sharper, positional players play more deterministically |
| 7 | **Endgame Strength** *(new)* | endgame_conversion stat + endgame CPL | Separate temperature for game phase = 2 |
| 8 | **Time Management** *(new)* | avg_move_time, time_pressure_tendency | Drives premove style; in time trouble model gets sloppier |
| 9 | **Trade Preference** *(new)* | exchange_tendency + material-equal capture initiation rate | Logit boost/penalty on equal-trade captures |
| 10 | **Repertoire Width** *(new)* | opening_diversity (unique openings / games) | Width of opening-book sampling; broader = higher temperature within the book |
| 11 | **Pawn Aggression** *(new)* | h/g pawn push rate; non-central pawn pushes in middlegame | Logit boost on pawn pushes that advance the storm |
| 12 | **Defensive Tenacity** *(new)* | win rate from worse-eval positions; "swindle rate" | When losing, refuses to resign-pattern, plays sharper |
| 13 | **Color-Specific Mode** *(new, selector not slider)* | Separate stats vectors as White vs Black | Auto-applies the right vector at game start |

### 4.2 Where the new stats need to be computed

Add these to `ml/src/data/player_stats.py`. Each is a single extra counter in the existing PGN walk loop — no extra fetch cost.

- **Sacrifice frequency:** count moves where eval drops by ≥150 cp but the player wins/draws within 10 moves.
- **Eval volatility:** stdev of `[%eval]` swings across moves in a game.
- **King-zone attackers delta:** for each move, count enemy king-zone attackers before and after; track positive deltas.
- **Quiet move ratio:** moves that are not capture/check/castle.
- **Phase-specific CPL:** open separate CPL accumulators for moves before move 12 / 12–40 / 40+.
- **Move-time stats:** parse `[%clk H:MM:SS]` annotations (already supported by Lichess via `clocks=true` in the API call, which we already pass).
- **Color-specific everything:** maintain two `PlayerStats` instances, one per color, and either store both in the embedding (a 50-dim vector) or auto-select at game start.
- **Phase-of-game opening frequency:** track unique positions reached by move 8, not just first move (1.e4 vs 1.d4 is too coarse — splits "London player" and "Italian player" both as e4/d4 respectively).

### 4.3 Where they feed into the model

- **Continuous stats:** extend the 25-dim vector → 40-dim. Bump `num_player_stats` in `config.py`. Retrain.
- **User overrides:** extend `StyleOverrides` to a `StyleProfile` with all 12 slider fields. Sampler reads them and applies bias deltas similar to how `aggression` already works.
- **Color-aware:** add a `player_color: chess.Color` field to predict request; the ML side picks the correct stats vector.

### 4.4 UX consideration

13 sliders is too many to put in a single panel. The proposed UX:

- **Default view:** show the 3 existing sliders + an "Advanced" toggle.
- **Advanced view:** show all 13 in two columns, grouped by category (Combat, Time, Repertoire, Phases).
- Each slider shows the **player's actual measured value** as a baseline tick mark, so dragging away from it tells the user "you're now making them MORE aggressive than they really are."
- **Reset to clone** button: snaps all sliders to the measured baselines for the selected player.

### 4.5 A note on validity

Don't expose sliders we can't credibly drive. If `opposite_color_bishop_skill` is always 0.5 (it currently is), don't put it in the UI. Better to over-deliver on 8 well-grounded dimensions than fake-deliver 25.

---

## 5. Roadmap of Improvements

Each item below is scoped, estimated, and ordered by impact-per-week-of-work for the YC presentation horizon.

### 5.1 P0 — Persistence and reliability (the refresh + premove bug)

**Estimated: 3 days. Ship before YC presentation.**

1. **Frontend persistence**
   - Wrap `playerStore` with `persist({ name: "mp-player-v1", storage: createJSONStorage(() => sessionStorage) })`. SessionStorage is intentional — we don't want cross-tab pollution.
   - Wrap `gameStore` with `persist` using `partialize` to skip the live `chess` instance, store just `pgn`, `playerColor`, `timeControl`, `playerTimeLeft`, `opponentTimeLeft`, `moveHistory`, `premove`. On rehydrate, rebuild `chess = new Chess(); chess.loadPgn(pgn);`.
   - Auto-rehydrate on `App.tsx` mount.

2. **ML profile cache in Redis**
   - On `build_player_profile` success, serialize the `OpeningBook` (already has `to_dict`/`from_dict`), the stats vector, and the time control into a Redis hash at `profile:{player_key}`. TTL 24 h.
   - On `predict`, if `player_key` is in the request but not in process memory, attempt to rehydrate from Redis before failing. Log cache misses.
   - Expose `GET /ml/player/{player_key}` to check whether a profile is cached (frontend can preflight on app load to know whether to show the player as still selected).

3. **Per-player build lock**
   - Use a Redis `SETNX profile:lock:{player_key}` with TTL 30 s when starting a profile build, release on success. Concurrent builds for the same player short-circuit and await the in-flight one.

4. **Inference concurrency**
   - Add an `asyncio.Lock` around `prediction_pipeline.load_model_for_rating`. Don't hot-swap mid-request.
   - Move the model singleton to a per-rating-bracket cache so we never have to "swap" — load lazily, keep up to N in memory.

5. **Premove safety**
   - Frontend: track one queued premove only; replace on subsequent premove attempts (current code does this — but verify across the chain).
   - Frontend: cancel in-flight prediction requests with `AbortController` when a new one is queued.
   - Frontend: hard-cap "consecutive auto-played opponent moves without a player move" at, say, 3 — beyond that, pause and show "Resume?" rather than chaining indefinitely.

6. **Backend rate limiting**
   - Per-IP cap on `/api/predict` already exists (100 req/min). Add per-session cap of 10 in flight to prevent runaway.

### 5.2 P0 — Visible style sliders (the "more weights" ask)

**Estimated: 4 days.**

- Extend `PlayerStats` with the eight new stats from §4.2.
- Extend `StyleOverrides` → `StyleProfile` with all 12 slider fields.
- Add baseline-tick display in `StyleSliders.tsx`.
- Update `sample_move` to read every field and apply per-field bias delta.

### 5.3 P0 — Chess.com parity with Lichess

**Estimated: 4 days.**

- **Local CPL annotation:** on `build_player_profile` for `chesscom`, run Stockfish at `depth=10` (not 18 — speed matters here) over every move in the fetched PGNs, write `[%eval]` annotations into the in-memory PGN representation, then compute CPL/blunder_rate the same way as for Lichess. For 200 games × 60 moves × 100 ms per Stockfish call, this is ~20 minutes. Run in a background task; return a "profile_in_progress" response and let the frontend poll. Cache the annotated PGNs to disk so repeat builds are instant.
- **Personal position index:** build a `PersonalExplorer` that maps `position_hash → {move_uci: count}` for every position the player reached in their fetched games. This is the Chess.com substitute for `/explorer/player`. Slot it into the prediction pipeline in the same priority position as `get_player_explorer_moves`.

### 5.4 P0 — Train and ship bracket checkpoints

**Budget-adjusted: $25–35 of GPU credit, one afternoon, ~10 GB disk.**

> **Update (May 2026):** the original PRD scoped this at $500 / 1.8 TB /
> 9 brackets / 2.5 years of data. That assumed VC funding. For the
> pre-seed budget ($50 GPU credit, personal laptop), we rescope to a
> "lean training" plan that still unlocks the neural-network predict path
> and the §5.5 personalize endpoint. See [USER_PROGRESS.md](USER_PROGRESS.md)
> Phase B for the exact runbook.

**Lean plan (recommended):**
1. Download ONE Lichess monthly archive (e.g. 2024-06).
2. Filter + bracket into **3** buckets: 1000-1200, 1400-1600, 1800-2000 — covers ~70% of rated players.
3. 10k games per bracket → `scripts/preprocess_corpus.py` → HDF5 (~1.5 GB each).
4. Train 8 epochs per bracket on a rented A4000 or free-tier T4 → `phase1_best.pt`.
5. Smoke-test with `scripts/smoke_test_humanization.py`.
6. Ship. Cost: ~$25–30. Disk: ~10 GB peak.

**Full plan (post-funding):**
- 9 brackets, 30k games each, 2.5 years of archives. ~$500 compute.
- This plan is fully scripted: `scripts/download_corpus.sh` + `scripts/train_all_brackets.sh`.

Target metric: top-1 move match ≥35% per bracket on the lean plan; ≥40–50% on the full plan.
Use `scripts/eval_harness.py` to benchmark.

### 5.5 P1 — Per-player fine-tuning ("Phase 3")

**Estimated: 1 week.**

- New endpoint `POST /ml/player/{player_key}/fine-tune`.
- Job runs `setup_for_phase3` (freezes everything except the player embedding), trains for ~200 steps on the player's PGNs (5 min on a single GPU, 30 min on CPU).
- Writes the resulting embedding row to Postgres `ml_player_embeddings` keyed by `player_key`.
- At predict time, load the row into the in-memory embedding table.
- Show in UI: "Personalized model trained on 437 of DrNykterstein's games — 8 minutes ago."

### 5.6 P1 — Replay-against-yourself, the killer growth feature

**Estimated: 3 days after the above ship.**

After the user signs up, automatically fetch their own games, build their profile, and offer a one-click "Play yourself" mode. This becomes the single most viral feature: "I beat my own AI clone in 23 moves" → screenshot → share.

### 5.7 P1 — Game review against the clone

**Estimated: 2 days.**

Existing `/api/predict/review` does CPL-based engine analysis. Extend it: for every move, also compute "what would the clone have played here?" If user move and clone move differ AND user move loses material vs clone move, surface this. This is differentiated review nobody else does.

### 5.8 P2 — Practice mode

**Estimated: 3 days.**

User selects an opening (e.g. "Sicilian Najdorf"). System plays through the mainline, then drops the user into typical positions; clone responds. User practices the opening against their specific upcoming opponent's repertoire.

### 5.9 P2 — Coach mode

**Estimated: 1 week.**

Aggregate the user's blunder patterns from saved games. Surface them: "You consistently miss back-rank threats in queenless middlegames." This is hard, high-value, and the foundation of subscription pricing.

### 5.10 P3 — Mobile

Defer until web product is sticky. React Native shell over the same backend.

---

## 6. Detailed Fix Specifications (the engineering tickets)

### 6.1 Refresh + premove hang — full fix

**Files touched:**
- `frontend/src/store/playerStore.ts`
- `frontend/src/store/gameStore.ts`
- `frontend/src/App.tsx` (or wherever the root-mount lives)
- `frontend/src/hooks/usePrediction.ts`
- `frontend/src/components/Game/GameScreen.tsx`
- `ml/src/inference/pipeline.py`
- `ml/src/api/players.py`
- `ml/src/api/predict.py`
- new `ml/src/db/cache.py` (Redis client for profile cache)

**Acceptance criteria:**
1. Refresh the browser at any point. Player selection survives. Game survives. Premove (if any) survives or is cleanly dropped with no game-state corruption.
2. Restart the ML service. Reload the frontend. The player's profile transparently rehydrates from Redis. Predictions resume.
3. Queue 20 premoves in a row on a 30-second blitz game. No hang. Either the moves execute one-by-one as the opponent thinks, or the queue is gracefully dropped with a UI hint ("Premove cancelled — opponent's response was unexpected").
4. Hit `/api/predict` 30 times concurrently for the same player. The model loads exactly once per rating bracket. No state corruption.

### 6.2 Train and ship the bracket checkpoints — concrete steps

```bash
# 1. Download
cd ml
python scripts/download_lichess_data.py --start 2023-01 --end 2025-04 --output data/raw/

# 2. Preprocess per bracket
for low in 400 800 1000 1200 1400 1600 1800 2000 2200; do
  high=$((low + 200))
  [ $low = 2200 ] && high=2500
  python scripts/preprocess_corpus.py data/raw/ \
    --rating-range $low-$high \
    --output data/processed/train_${low}_${high}.h5 \
    --stockfish  # adds eval annotations
done

# 3. Train
bash scripts/train_all_brackets.sh

# 4. Smoke test
for ckpt in data/checkpoints/*/phase1_best.pt; do
  python scripts/smoke_test_humanization.py --checkpoint $ckpt
done
```

The compute budget: ~200 GPU-hours total at the 256-channel / 15-block size. On rented H100s that's about $400 of compute. On a single 4090 it's ~10 days wall-clock. Either is feasible.

### 6.3 Per-player fine-tune — concrete steps

After §6.2 ships:

1. New endpoint `POST /ml/player/{player_key}/personalize`:
   - Loads the bracket checkpoint nearest the player's rating.
   - Calls `model.setup_for_phase3()` — freezes everything except the embedding table.
   - Trains 200 steps at LR `1e-3` on a dataloader over the player's PGNs (already preprocessed during `build_player_profile`).
   - Extracts the player's row from `model.player_embedding.player_embedding.weight` and stores in Postgres.
2. At predict time, if a personalized row exists for `player_key`, splice it in before forwarding to the model.
3. Re-personalize automatically every time we fetch ≥50 new games for that player (a background nightly task).

### 6.4 Style sliders expansion — concrete steps

1. Add eight new computed fields in `ml/src/data/player_stats.py` per §4.2.
2. Bump `num_player_stats` in `ml/src/config.py` from 25 → 40 and increment all checkpoint version checks.
3. Extend `StyleOverrides` to `StyleProfile` with 12 fields.
4. Extend `apply_style_bias` in `ml/src/inference/sampler.py` to apply each.
5. UI: replace `StyleSliders.tsx` with a paginated panel; reuse `StylePanel.tsx` shell.

---

## 7. Architecture diagrams (the "actually how it works today" version)

### 7.1 Live prediction path (what runs on every move today)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   USER PLAYS A MOVE IN THE BROWSER                         │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ gameStore.makeMove()
                                  │ → moveHistory.length increments
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  GameScreen.tsx useEffect on moveHistory.length                            │
│  → usePrediction.fetchPrediction()                                         │
│  → axios POST /api/predict {fen, move_history, player_rating, player_key}  │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ 30s timeout
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Backend  Express  /api/predict  (backend/src/routes/predict.ts)          │
│   - Zod validation                                                         │
│   - Redis cache lookup (30 min)                                            │
│   - mlClient.predict() → http://ml:8000/ml/predict                         │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ML  FastAPI  /ml/predict  (ml/src/api/predict.py)                         │
│   - parse FEN                                                              │
│   - fire-and-await Stockfish top-5 from pool (non-blocking)                │
│   - prediction_pipeline.predict(...)                                       │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  ▼
       ┌──────────────────────────┴────────────────────────────┐
       │  prediction_pipeline.predict   (pipeline.py)            │
       │   has_checkpoint? ──── NO ──┐                           │
       │                              ▼                           │
       │  _predict_with_data (the ONLY active path today)        │
       │     ├── lichess_explorer.get_explorer_moves(fen,rating) │
       │     ├── if lichess player:                              │
       │     │     lichess_explorer.get_player_explorer_moves    │
       │     ├── opening_book.get_move_probabilities(history)    │
       │     ├── pick best data source by quality                │
       │     ├── if all empty → stockfish heuristic logits       │
       │     └── sample_move(logits, board, style, ...)           │
       │              ├── opening book prior blend                │
       │              ├── aggression bias                         │
       │              ├── 7 blind-spot biases (rating-scaled)    │
       │              ├── temperature, top-p, min-prob floor     │
       │              └── argmax or multinomial                  │
       └──────────────────────────┬────────────────────────────┘
                                  ▼
                          PredictResponse
                                  │
                                  ▼
              applyPredictedMove(move) on the board
              → triggers premove auto-execute if queued
              → triggers another useEffect → another predict (next opponent move)
```

### 7.2 Build-profile path (what happens when the user picks an opponent)

```
User types "DrNykterstein", picks Lichess, clicks Go.
            ▼
PlayerSearch.tsx → usePlayerProfile.fetchProfile
            ▼
POST /api/players/build-profile → POST /ml/player/build-profile
            ▼
ml/src/api/players.py::build_player_profile
   ├── fetch_player_profile(username)  → authoritative rating per TC
   ├── fetch_player_games(username, max=200, perf=blitz?)  ──┐
   │                                                          │ stream PGNs
   ├── compute_stats_from_pgns(pgns, username)  ─────────────┤
   │     ├── walk every move                                  │
   │     ├── parse [%eval] annotations  → CPL, blunder_rate  │
   │     └── return PlayerStats (25 fields)                  │
   ├── OpeningBook().add_game(moves)  for each PGN  ────────┤
   ├── prediction_pipeline.load_model_for_rating(rating)    │
   │     └── (no checkpoint exists → noop today)             │
   ├── prediction_pipeline.set_opening_book(key, book)      │  ALL OF THIS
   ├── prediction_pipeline.set_player_stats(key, vec)       │  STATE IS LOST
   └── prediction_pipeline.set_player_time_control(key,tc)  │  ON ML RESTART
            ▼                                                ◀──┘
PlayerProfile returned → setOpponent(profile) on frontend store
            ▼
StyleSliders.tsx now reads the 3-of-25 style fields.
ChessBoard.tsx renders OpponentBadge with name + rating.
```

---

## 8. Metrics and Eval

### 8.1 What to measure (engineering)

- **Top-1 move match accuracy** vs held-out human games at the target rating. North-star metric. Maia-2 ≈ 50%.
- **Top-5 move match accuracy**. Less brittle. Target ≥75%.
- **CPL distribution KL-divergence** between predicted and actual human CPL at each rating. We want the model to lose 12 cp per move at 1500, not 0 (engine) and not 80 (random).
- **Opening repertoire reproduction:** for a target player, what fraction of their actual first-12 moves does the clone produce in a fresh game? Target ≥80% on the player's top-3 openings.
- **Latency:** p95 predict latency ≤ 500 ms. Currently dominated by the 5 s Lichess explorer timeout when it fails — fix by parallelizing with a stricter budget.

### 8.2 What to measure (product)

- **Time to first game.** From signup to first move played: target ≤ 60 s.
- **Games per session.** Healthy is ≥3.
- **D7 retention.** YC asks. Target 25%+ for a v0.
- **Share rate.** Fraction of games saved that get the share button clicked. Goal: viral coefficient.

### 8.3 Eval harness

Build a benchmark of 500 Lichess games per rating bracket from 2025-Q1 (held out from training). For each move in each game, query the model and compute the metrics above. Store results to `data/eval/results.parquet`. Run after every checkpoint.

---

## 9. Risk and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lichess revokes / rate-limits the Opening Explorer API | Low | High | Cache aggressively in Redis; fall back to local DB of explorer dumps. |
| Chess.com TOS push-back on automated fetching | Medium | Medium | The Published Data API is officially supported; cap fetch frequency per the docs. Identify with a clear User-Agent (already done). |
| Privacy concerns ("you cloned me without consent") | Medium | Medium | The public game data is opt-in by virtue of being on Lichess/Chess.com. Offer a delete-my-profile endpoint and an opt-out mechanism keyed by the player's verified ownership of the username. |
| Compute cost of training 8 brackets | Low | Low | One-time spend, ~$400. After that, only per-player fine-tunes which are CPU-feasible. |
| The neural model under-performs the explorer fallback | Medium | High | Until top-1 ≥ 40% per bracket, keep the data fallback ON and let it dominate. The fallback today already produces respectable human-shaped play. |
| YC reviewers ask "what's defensible vs Chess.com / Lichess just building this?" | High | High | Answer: the per-player network effect, the cross-source unification (only product that simulates both Chess.com AND Lichess players), and the personalization depth (Phase 3 fine-tune is unique). |

---

## 10. Cut List (what we are NOT doing for v1)

- Multi-variant chess (960, Crazyhouse, etc.) — engine doesn't support cleanly.
- Live tournament participation — out of scope.
- Real-time multi-user matches — out of scope; product is single-player vs AI clone.
- Mobile native — defer.
- Opening explorer for Chess.com aggregate (would require building it ourselves; Lichess explorer's aggregate is good enough for v1).
- Variant time controls (custom increment, delays) — UI is fixed to standard `initial+increment`.

---

## 11. The YC Story (one-pager for the pitch)

**Problem:** Chess training tools treat your opponent as a generic engine output. Stockfish-at-1500 plays nothing like the actual 1500-rated person you're about to face. Maia showed you can do better at the population level. Nobody has done it at the *individual* level.

**Solution:** Pull any public chess account's game history. Build a behavioral fingerprint — opening repertoire, blunder patterns, time-management profile, attack/defense tendencies, 40 dimensions of style. Serve it as a playable opponent you can practice against, prepare against, or learn from.

**Insight:** 150M+ chess players have ~50+ public rated games. That's enough to model anyone. Every active user contributes their data, which improves cross-player priors. Data network effect.

**Status:** Full-stack product built. Live explorer-grounded predictions ship today. Neural network trained checkpoints shipping in the next two weeks. Per-player fine-tuning shipping in the next month.

**Ask:** Pre-seed to fund compute, three months of solo runway to ship the model and personalization, then a seed once retention is proven.

**Why now:** Maia-2 proved the technique works in 2024. Lichess and Chess.com both expose the data publicly. Compute for the bracket models is ~$400. The window is open.

---

## 12. Appendix — Open Questions

1. **Do we need to support Chess.com players' personal positions?** The current asymmetry (Lichess gets `/explorer/player`, Chess.com doesn't) leaves Chess.com simulations weaker. §5.3 fixes it by building our own. Cost: 20 min profile build per Chess.com user. Worth it.
2. **Should style overrides persist per-opponent?** Currently they're global. Probably yes — "I always want Magnus dialed +20 aggressive" should survive opponent switches.
3. **What's the right number of brackets?** Lichess Explorer uses 9 buckets. We use 9 in `load_model_for_rating`. Maia uses 3. More buckets = sharper rating fidelity but more checkpoints to maintain. 9 is the right v1.
4. **Do we open-source the bracket models?** Maia is open. We probably should too — the moat is the per-player layer, not the bracket pretraining. Open-sourcing the brackets earns us community credibility for the YC narrative.
5. **Pricing:** free tier for opponents from public APIs; paid tier ($8/mo?) for personalized fine-tuning and game review. Validate post-YC.

---

*End of document.*
