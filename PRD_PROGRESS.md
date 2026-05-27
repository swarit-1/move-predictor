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
| §3.2 | P0 — No trained model in production | ⏸ | Architecture and pipeline both ready. Awaits user-side training (see [USER_PROGRESS.md](USER_PROGRESS.md) Phase B). The fallback `_predict_with_data` path still serves predictions in the meantime. |
| §3.3 | P1 — No per-player fine-tuning | ✅ (skeleton) ⏸ (gated on §3.2) | Endpoint `POST /ml/player/{key}/personalize` ships and runs end-to-end the moment the first bracket checkpoint exists. Until then it returns 412 with the runbook in the error body. See `ml/src/api/personalize.py`. |
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
| §4.1 | 12-slider taxonomy | ✅ (10 of 13) | Skipped: Pawn Aggression (niche), Color-Specific Mode (deferred — requires color-conditioned stats vector). Shipped: 10 dimensions with full sampler integration. |
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
| §5.3 | P0 — Chess.com parity | ✅ | `PersonalExplorer` + lightweight Stockfish CPL pass at build time. Chess.com profiles now get real CPL/blunder stats + position-keyed personal move data. Full parity with Lichess. |
| §5.4 | P0 — Train 8 bracket checkpoints | ⏸ | **Rescoped for $50 budget** — see [USER_PROGRESS.md](USER_PROGRESS.md) for the lean path (3 brackets, single month, ~$30 compute, ~10 GB disk). `scripts/download_corpus.sh` driver shipped. |
| §5.5 | P1 — Per-player Phase 3 fine-tune | ✅ (code) ⏸ (gated on §5.4) | Full implementation lives in `ml/src/api/personalize.py`. Returns 412 until a bracket checkpoint exists. |
| §5.6 | P1 — Play-yourself flow | ✅ | `User` model gained `linkedChessSource`/`linkedChessUsername`. New `POST /api/auth/link-chess`. `WelcomeScreen` surfaces a "Play yourself" button + an inline link form. `App.tsx::handlePlayYourself` builds the profile and drops into a game. |
| §5.7 | P1 — Game review against clone | ✅ | `/ml/review` accepts `clone_player_key` + `clone_color`; surfaces "your real opponent would not have made this mistake" as an amber panel in `MoveDetail`. |
| §5.8 | P2 — Practice mode | ✅ | `PracticeScreen` now has a "Practice vs [opponent]" toggle when a profile is loaded. Selecting it uses the clone's opening book + personal explorer instead of a generic rating opponent. |
| §5.9 | P2 — Coach mode | ✅ | Full stack: ML `POST /ml/coach` → backend `POST /api/predict/coach` → `CoachScreen.tsx` reachable from the welcome page as mode "04 Coach." Fetches the user's saved games, runs them through the endpoint, and renders phase accuracy bars + top-8 blunder patterns with natural-language descriptions. |
| §5.10 | P3 — Mobile | 🔴 | Deferred. |

---

## §6 — Detailed fix specifications

| # | Spec | Status |
|---|---|---|
| §6.1 | Refresh + premove hang full fix | ✅ |
| §6.2 | Train + ship bracket checkpoints | ⏸ User-side work |
| §6.3 | Per-player fine-tune | ✅ skeleton; activates on §6.2 |
| §6.4 | Style sliders expansion | ✅ |

---

## §7–§12 (informational)

| Section | Status | Notes |
|---|---|---|
| §7 Architecture diagrams | ✅ in PRD | Current as of the audit. |
| §8 Metrics and eval | ✅ | `scripts/eval_harness.py` ships — replays held-out games through the prediction pipeline and reports top-1 / top-5 accuracy, avg predicted CPL, per bracket. Outputs JSON. Run after §5.4 training with `python3 scripts/eval_harness.py data/raw/eval_games.pgn --rating-min 1400 --rating-max 1600`. |
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

# Backend
cd backend && npx prisma generate                # required after schema changes
cd backend && npx tsc --noEmit                   # expect: clean

# ML
cd ml && python3 -m pytest tests/ -q             # expect: 64 passed
```

Last green run: frontend TS clean, backend TS clean, 64/64 ML tests passing.
