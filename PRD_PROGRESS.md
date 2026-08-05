# PRD Progress Ledger

> Source of truth: [PRD.md](PRD.md). This file tracks the status of every
> PRD item by section so it's obvious what shipped, what's in flight, and
> what's blocked on the user. Update this file as items move.
>
> Legend: ✅ shipped · 🟡 partial · 🔴 not started · ⏸ blocked on user

---

## §3 — Critical bugs and defects

| # | Section | Status | Notes |
|---|---|---|---|
| §3.1 | P0 — Refresh + premove hang | ✅ | Frontend `persist` on `playerStore`/`gameStore` + ML Redis profile cache + cold-cache rehydrate + `AbortController` on predictions + watchdog effect. See `ml/src/db/cache.py`, `frontend/src/hooks/usePrediction.ts`. |
| §3.2 | P0 — No trained model in production | ✅ | **Trained 2026-07-31, locally on Apple M4 (MPS), $0.** Three bracket checkpoints shipped (`ml/data/checkpoints/{1000_1200,1400_1600,1800_2000}/phase1_best.pt`), 2 epochs × ~1M positions each from eval-annotated 2025-06 Lichess games. Val top-1: 27.1% / 26.9% / 26.3%. Cross-month held-out (2025-05) masked argmax top-1: 22.7% / 25.5% / 23.8%. Checkpoints auto-load per rating at predict time; `/ml/health` now reports the active checkpoint. |
| §3.3 | P1 — No per-player fine-tuning | ✅ | Endpoint `POST /ml/player/{key}/personalize` verified live end-to-end (120 steps over 6,000 positions in ~31 s against the 1800-2000 checkpoint). |
| §3.4 | P1 — Only 3 style sliders / 3 stats used | ✅ | Expanded to **10 sliders + 33-dim stats vector**. Sampler reads every dimension. New: `king_attack`, `positional`, `trade_preference`, `opening_loyalty`, `repertoire_width`, `endgame_strength`, `defensive_tenacity`. Baseline tick marks rendered under each slider. |
| §3.5 | P2 — Chess.com simulation quality | ✅ | `PersonalExplorer` ships + lightweight Stockfish CPL pass (`annotate_pgns_with_stockfish` at depth 8, ~400 positions, ~30 s) now runs for Chess.com profiles during `build_player_profile`. CPL/blunder stats are no longer defaults for Chess.com players. |
| §3.6 | P2 — Risk-taking derivation is brittle | ✅ | Risk-taking now blends `eval_volatility` + `(1 - consistency)`. Eval volatility is a directly-computed PGN stat (stdev of `[%eval]` swings) rather than an inverse-consistency proxy. See `_derive_baseline_style` in `ml/src/api/players.py`. |
| §3.7 | P2 — Chess.com classical/daily alias | ✅ | `/ml/player/build-profile` returns 400 with explanatory text when `source=chesscom` + `time_control=classical`. No more silent aliasing. |
| §3.8 | P3 — Two-DB-one-Postgres footgun | ✅ | `docker-compose.yml` split into `postgres-app` (port 5432, `appdb`) and `postgres-ml` (port 5433, `mldb`). `.env.example` updated with separate connection strings. |
| §3.9 | P3 — Backend port single source | ✅ | `backend/src/index.ts` now reads `config.port`. |
| §3.10 | P3 — `playersRouter` Lichess-only autocomplete | ✅ | UI now warns when source=chesscom that exact spelling is required. |
| §3.11 | P3 — Live `Chess` in store default | ✅ | Handled by `gameStore`'s `partialize` + `onRehydrateStorage` — `Chess` is reconstructed from the persisted PGN. |
| §3.12 | P3 — `/training/start` stub | ✅ | Both endpoints now return 501 with a pointer to `scripts/train.py`. |

---

## §4 — Style weights expansion

| # | Item | Status | Notes |
|---|---|---|---|
| §4.1 | 12-slider taxonomy | ✅ (13 of 13) | **Completed 2026-08-05**: Pawn Aggression shipped (storm-push stat + rating-scale slider + sampler flank/space bias, full stack) and Color-Specific Mode shipped (per-color stats computed at build when ≥10 games per color, cached in Redis, auto-selected by side-to-move at predict — PRD's 'selector not slider' spec). 33-dim vector unchanged for checkpoint compatibility; new stat drives baselines/sampler only. |
| §4.2 | Stats expansion | ✅ | 8 new fields: `sacrifice_rate`, `eval_volatility`, `king_attack_intensity`, `quiet_move_ratio`, `opening_cpl`, `middlegame_cpl`, `endgame_cpl`, `capture_initiation_rate`. Plus actually populating `avg_move_time` and `time_pressure_tendency` from `[%clk]` annotations. |
| §4.3 | Feed into model | ✅ | `num_player_stats` bumped 25 → 33. Model auto-scales (forward smoke test verified). |
| §4.4 | UX (basics + advanced toggle, baseline tick marks, reset-to-clone) | ✅ | `StyleSliders.tsx` rewritten with paginated groups. |
| §4.5 | Don't expose un-grounded dimensions | ✅ | The three remaining unbacked stats (`opposite_color_bishop_skill`, `rook_endgame_skill`, `pawn_endgame_skill`) are still in the vector for back-compat but not surfaced as sliders. |

---

## §5 — Roadmap

| # | Item | Status | Notes |
|---|---|---|---|
| §5.1 | P0 — Persistence + reliability | ✅ | Complete. All sub-items: frontend persist, Redis profile cache, build lock, inference concurrency, premove safety. |
| §5.2 | P0 — Visible style sliders | ✅ | Complete. See §4 above. |
| §5.3 | P0 — Chess.com parity | ✅ | `PersonalExplorer` + lightweight Stockfish CPL pass at build time. Chess.com profiles now get real CPL/blunder stats + position-keyed personal move data. Full parity with Lichess. **2026-08-01: rating-pool translation shipped** — Chess.com ratings run a few hundred points below Lichess at the same strength; `ml/src/data/rating_translation.py` translates them to the internal Lichess scale for bracket selection, model conditioning, and sampler schedules (profile builds automatic; `rating_pool` field on predict/simulate; By-Rating tab has a Lichess/Chess.com scale toggle). Display keeps the platform rating. |
| §5.4 | P0 — Train 8 bracket checkpoints | ✅ (9 of 9) | **All nine brackets trained (2026-08-04)** on fixed-encoder data. Cross-month masked top-1: extended 4-epoch brackets 28.9–32.8%; fresh 2-epoch brackets 19.8–23.7%. Full 400–2500 coverage; +2-epoch extensions for the fresh six are queued (proven +6–8 pts each). |
| §5.5 | P1 — Per-player Phase 3 fine-tune | ✅ | Active and verified (see §3.3). **2026-07-31: now fully automatic** — build-profile triggers a background fine-tune (worker thread, non-blocking); the opponent badge surfaces the progressive stage (Generic → Repertoire → Personalized) via `GET /api/players/clone-status/:key`. The model path also blends the player's `PersonalExplorer` position history into the policy logits (`personal_prior_boost` in config). |
| §5.6 | P1 — Play-yourself flow | ✅ | `User` model gained `linkedChessSource`/`linkedChessUsername`. New `POST /api/auth/link-chess`. `WelcomeScreen` surfaces a "Play yourself" button + an inline link form. `App.tsx::handlePlayYourself` builds the profile and drops into a game. |
| §5.7 | P1 — Game review against clone | ✅ | `/ml/review` accepts `clone_player_key` + `clone_color`; surfaces "your real opponent would not have made this mistake" as an amber panel in `MoveDetail`. |
| §5.8 | P2 — Practice mode | ✅ | `PracticeScreen` now has a "Practice vs [opponent]" toggle when a profile is loaded. Selecting it uses the clone's opening book + personal explorer instead of a generic rating opponent. |
| §5.9 | P2 — Coach mode | ✅ | Full stack: ML `POST /ml/coach` → backend `POST /api/predict/coach` → `CoachScreen.tsx` reachable from the welcome page as mode "04 Coach." Fetches the user's saved games, runs them through the endpoint, and renders phase accuracy bars + top-8 blunder patterns with natural-language descriptions. |
| §5.10 | P3 — Mobile | ✅ | Expo React Native app in `mobile/`. Full feature parity: auth, setup (player/rating/style), game play with tap-to-move board, 10-slider style controls, prediction panel, eval bar, game clock, move list, game review with clone annotations, replay famous games, opening practice, coach mode, saved games history. Zustand stores with AsyncStorage persistence, SecureStore for JWT. Same backend API. |

---

## §6 — Detailed fix specifications

| # | Spec | Status |
|---|---|---|
| §6.1 | Refresh + premove hang full fix | ✅ |
| §6.2 | Train + ship bracket checkpoints | ✅ 3 lean brackets shipped (2026-07-31) |
| §6.3 | Per-player fine-tune | ✅ active, verified |
| §6.4 | Style sliders expansion | ✅ |

---

## §7–§12 (informational)

| Section | Status | Notes |
|---|---|---|
| §7 Architecture diagrams | ✅ in PRD | Current as of the audit. |
| §8 Metrics and eval | ✅ | `eval_harness.py` + `believability_report.py` (per-checkpoint gates: masked/sampled top-1/3/5, **CPL KL-divergence** and mean-CPL calibration (predicted 59.8 vs actual 60.0 cp at 1500), **opening repertoire reproduction** (first-12 argmax), mate-conversion vs human baseline) + `selfplay_audit.py` (1,500-game blunder taxonomy, free-hang gradient 0.01–0.9% by rating) + `inference_ms` latency field on every predict response (§8.1 p95 target). |
| §9 Risks and mitigations | ℹ️ | Reference doc; nothing to "ship." |
| §10 Cut list | ℹ️ | Reference doc. |
| §11 YC story one-pager | ℹ️ | Reference doc; you'll lift this into the deck. |
| §12 Open questions | ℹ️ | Discussion topics; some decisions still pending — see user progress. |

---

## Verification snapshot

Run this anytime to verify the in-session work hasn't regressed:

```bash
# Frontend
cd frontend && npx tsc --noEmit                  # expect: clean

# Backend (requires local Postgres up: docker compose up -d postgres-app)
cd backend && npx prisma generate                # required after schema changes
cd backend && npx tsc --noEmit                   # expect: clean
cd backend && npm test                           # expect: 36 passed

# ML
cd ml && python3 -m pytest tests/ -q             # expect: 119 passed

# Model quality gates (cross-month held-out games)
cd ml && python3 scripts/believability_report.py \
  data/checkpoints/1400_1600/phase1_best.pt \
  data/eval/lichess_2025-05_1400-1600.pgn --rating 1500 --max-games 40

# Blunder-realism audit (self-play, free-hang taxonomy)
cd ml && python3 scripts/selfplay_audit.py --bracket 1400_1600 --rating 1500 \
  --games 100 --device mps
```

Last green run (2026-08-05): frontend TS clean, backend TS clean, 36/36
backend tests, 119/119 ML tests, believability gates pass on extended
brackets (top-1 ≥33%, mate conversion = human baseline), free-hang rate
0.01–0.11% at club ratings across 1,500 audited self-play games.
