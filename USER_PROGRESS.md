# User Runbook — What's Left For You To Do

> Companion to [PRD_PROGRESS.md](PRD_PROGRESS.md). Everything in this file
> is work that requires a human decision, an external account, money, or
> a long-running compute job. Items are in execution order.
>
> **STATUS UPDATE 2026-07-31: Phase B (lean training) is DONE — executed
> locally on the M4 MacBook's GPU (MPS) overnight, $0 spent, no GPU rental
> needed.** Three bracket checkpoints live in `ml/data/checkpoints/`
> (1000-1200, 1400-1600, 1800-2000), predictions serve from the trained
> model, and the §5.5 personalize endpoint is active and verified.
> Measured quality: val top-1 ≈ 27% per bracket; cross-month held-out
> masked top-1 22.7–25.5%. The 35% target needs more epochs/data — see
> "Optional refinement" below. Phases A/B below are kept for reference;
> only their unchecked decisions (A.5) still apply.
>
> **Optional refinement (whenever the laptop is idle):** each bracket
> resumes cleanly for extra epochs, ~85 min per epoch per bracket:
> ```bash
> cd ml && python3 scripts/train.py --phase 1 \
>   --data data/processed/train_1400_1600.h5 \
>   --val-data data/processed/val_1400_1600.h5 \
>   --checkpoint data/checkpoints/1400_1600/phase1_latest.pt \
>   --epochs 2 --batch-size 256 \
>   --checkpoint-dir data/checkpoints/1400_1600 --log-dir runs/1400_1600
> ```
> Expected: +3–5% top-1 from two more epochs (epoch 2 added +4.3%).
> Free the GPU first: stop the ML service and Docker Desktop during
> training (16 GB RAM is tight), and re-run the eval harness after.
>
> **Budget reality:** $50 of GPU credit, no 1.8 TB of disk. The original
> PRD §5.4 plan (2.5 years × 9 brackets × 30k games) is rescoped below
> into a "lean training" plan that fits the budget.

---

## Phase 0 — Reality check on the budget

| Resource | Original PRD assumption | What you have | Plan |
|---|---|---|---|
| GPU compute | $500 / ~200 H100-hours | $50 | Cut training scope ~10× (see Phase B). |
| Disk | 1.8 TB raw archives | personal laptop | Stream + filter, never persist raw archives. ~10 GB peak. |
| Wall-clock | 10 days on a 4090 | weekend | 3 brackets × 1 GPU-hour each = single afternoon. |

**The product still ships without §5.4 training at all.** The
explorer/Stockfish fallback path is already what serves predictions
today and it produces respectable human-shaped play. If you decide to
skip training entirely, the only feature that doesn't activate is the
§5.5 personalize fine-tune (it returns 412 with a clear error message).
Personalize is a "wow" feature for the YC demo but isn't load-bearing
for v1.

So you have three options. Pick one before Phase A.

### Option 1 — Ship without training, do personalize later (free, fastest)
- Skip everything in Phase B below.
- The product runs as-is. Selecting an opponent works via the existing
  explorer + opening-book + Stockfish path.
- Demo narrative: "Today we ground to real human move statistics from
  Lichess. The neural model architecture is built — once trained it
  will personalize per player. Here's the live product."

### Option 2 — Lean training: 3 brackets, single month (~$25–35) ⭐ recommended
- One Lichess monthly archive, three rating buckets (1000–1200, 1400–1600,
  1800–2000) — covers >70% of all rated games.
- ~10k games per bracket, ~5 GB disk peak.
- ~6 GPU-hours total on a rented A100 ≈ $20–30.
- §5.5 personalize activates for any player whose rating falls within
  ±200 of those three pretrains (effectively the entire rated population).

### Option 3 — Full PRD §5.4 (~$500, deferred until funded)
- Documented in PRD §6.2 unchanged. Don't attempt on $50.

The rest of this doc assumes **Option 2**.

---

## Phase A — Decisions (1 hour, before any compute)

Take these decisions before you provision anything; each one downstream
shapes a script flag.

### A.1 — GPU provider
Pick the cheapest spot-tier GPU on a provider that lets you mount disk
without storage-class headaches. As of this writing the practical
options:

| Provider | GPU | $/hr | Notes |
|---|---|---|---|
| Vast.ai | A4000 / 3090 / 4090 | $0.20–$0.45 | Best $/hr but flaky spot availability. |
| Runpod community | A4000 / RTX A5000 | $0.30–$0.50 | More reliable than Vast, GUI to launch. |
| Lambda Labs | A10 / A100 | $0.75–$1.10 | Single-click, well-documented. |
| Google Colab Pro | T4 / A100 | $10/mo flat | A100 only during peak hours; T4 is fine for these models. |

A 1× A4000 or 1× T4 is enough — these models are small (~10M parameters
total). Pick whatever's cheapest at the moment you provision. **Avoid
H100 — you don't need it.**

If you go Colab Pro: pay the $10, get the T4, write the checkpoints out
to Google Drive, scp them locally afterwards.

### A.2 — Set `LICHESS_API_TOKEN`
- Go to https://lichess.org/account/oauth/token.
- Create a token with no scopes checked (read-only is enough).
- Add to `.env`: `LICHESS_API_TOKEN=lip_xxxxxxxxxxxx`.
- Without it, the Lichess profile-fetch path rate-limits to 20 req/s
  (vs 30 with). Not strictly required for §5.4 (we download monthly
  archives, not the API), but the running product uses it for live
  profile builds.

### A.3 — Which rating brackets to train
Lean default for Option 2: **1000-1200, 1400-1600, 1800-2000**.

These three cover the bulk of the rated player base. If you want
different brackets (e.g. you have a specific opponent at 2200), swap them
in `scripts/download_corpus.sh` by editing the `BRACKETS` array or by
running `scripts/train_rating_bracket.sh <min> <max> <month> <max_games>`
directly per bracket.

### A.4 — Apply the database migration
Phase D below would normally cover this, but the §5.6 schema change
(linked chess account) needs to land in your dev DB before the play-
yourself UI can write. Run once now:

```bash
cd backend
npx prisma migrate dev --name add_linked_chess_account
```

If your DB is dockerized, make sure `docker compose up postgres -d` is
running first.

### A.5 — Decide open-source release
PRD §12.4 recommends open-sourcing the bracket checkpoints once they
exist. Confirm yes/no before training — affects whether you commit the
checkpoints to git LFS, ship them on HuggingFace, or keep them private.

---

## Phase B — Lean training (one weekend)

Run on the rented GPU box. All commands assume you're in `move-predictor/ml/`.

### B.1 — Install deps on the GPU box
```bash
cd ml
pip install -e ".[dev]"
bash scripts/download_stockfish.sh   # optional — only needed if you want the local-CPL annotation pass
```

### B.2 — Download corpus (3 brackets, single month)
The shipped `scripts/download_corpus.sh` runs all 9 brackets by default.
For Option 2, run the three you care about one at a time:

```bash
# Edit MAX_GAMES to taste. 10000 ≈ 5 GB filtered PGN per bracket.
MONTH=2024-06
MAX_GAMES=10000

python3 scripts/download_lichess_data.py --month $MONTH --rating-min 1000 --rating-max 1200 --max-games $MAX_GAMES
python3 scripts/download_lichess_data.py --month $MONTH --rating-min 1400 --rating-max 1600 --max-games $MAX_GAMES
python3 scripts/download_lichess_data.py --month $MONTH --rating-min 1800 --rating-max 2000 --max-games $MAX_GAMES
```

Each download streams + filters in one pipeline (uses `curl | zstd -d`)
so you never persist the raw `.zst` archive. Peak disk per bracket is
about 200 MB.

**Estimated time:** ~30 minutes per bracket on a residential connection.
The bottleneck is the Lichess CDN, not your machine.

### B.3 — Preprocess to HDF5
```bash
for min_max in "1000 1200" "1400 1600" "1800 2000"; do
  read -r MIN MAX <<< "$min_max"
  python3 scripts/preprocess_corpus.py \
    "data/raw/lichess_${MONTH}_${MIN}-${MAX}.pgn" \
    --output "data/processed/train_${MIN}_${MAX}.h5" \
    --val-split 0.05
done
```

**Estimated time:** ~10 minutes per bracket on a single CPU core.
HDF5 output is ~1.5 GB per bracket.

### B.4 — Train each bracket (the GPU step)
```bash
for min_max in "1000 1200" "1400 1600" "1800 2000"; do
  read -r MIN MAX <<< "$min_max"
  python3 scripts/train.py \
    --phase 1 \
    --data "data/processed/train_${MIN}_${MAX}.h5" \
    --val-data "data/processed/val_${MIN}_${MAX}.h5" \
    --epochs 8 \
    --batch-size 256 \
    --checkpoint-dir "data/checkpoints/${MIN}_${MAX}"
done
```

**Estimated time:** ~1.5–2 GPU-hours per bracket on an A4000 (8 epochs ×
~15 min/epoch). Three brackets = ~5 GPU-hours total = ~**$20–25**.

If your GPU dies mid-bracket, `train.py` writes a `phase1_latest.pt`
after every epoch, so restart it pointing at that checkpoint with
`--checkpoint data/checkpoints/${MIN}_${MAX}/phase1_latest.pt`.

### B.5 — Smoke test
```bash
for ckpt in data/checkpoints/*/phase1_best.pt; do
  python3 scripts/smoke_test_humanization.py --checkpoint "$ckpt"
done
```

Target: top-1 move-match accuracy ≥35% on the held-out validation set
per bracket. Anything ≥35% on this small-corpus regime indicates the
training worked; production-quality (Maia-2 territory of ~50%) needs the
full PRD §5.4 corpus and is for v2.

### B.6 — Pull checkpoints back to the dev box
```bash
# From your laptop, after training finishes
scp -r gpu-box:/path/to/move-predictor/ml/data/checkpoints/* ml/data/checkpoints/
```

Total checkpoint size: ~3 × 30 MB = ~100 MB. Fits in git LFS if you want
to commit them.

### B.7 — Restart the ML service
The pipeline detects checkpoints by path at predict time, so just
restart and they're picked up:

```bash
make dev-ml   # or your usual ml restart
```

Verify in the logs: you should see lines like
`Loaded 1400-1600 bracket model for rating 1500.0`.

### B.8 — Verify in production
1. Build a profile against any Lichess username whose rating falls
   inside one of your trained brackets.
2. Play a game. The first prediction's log line should now read
   `source=model` (not `source=stockfish_fallback`).
3. Hit `POST /api/players/{key}/personalize` once. It should run in
   under a minute and return `{ status: "ok", steps_run: 200, ... }`.
4. Play another game with the same opponent. Subsequent predictions
   should include the personalized embedding row.

---

## Phase C — Production cutover

### C.1 — Regression against your saved games
Before declaring victory:
- Pull 20 of your own past games out of the saved-games table.
- Replay each move through `/api/predict` with the bracket checkpoint
  loaded.
- Compute clone-vs-actual top-1 match rate.

Acceptable range: **35–50%** for the 3-bracket lean training. If it's
under 25% there's a bug; bisect by toggling `prediction_pipeline.has_checkpoint`
and comparing to the explorer-fallback path.

### C.2 — Feature flag personalize in the UI
**DONE (2026-07-31), and better than a button:** personalize now runs
automatically. Building a profile kicks off the Phase 3 fine-tune in the
background (worker thread — live predictions stay responsive), and the
in-game opponent badge shows the clone's fidelity stage live:
**Generic → Repertoire → Personalized** (polls
`GET /api/players/clone-status/:playerKey`). The trained-model path also
now blends the player's position-keyed personal history
(`PersonalExplorer`) into the policy logits, so the clone reproduces
their actual choices in any position they've faced before — middlegames
included, not just book lines.

---

## Phase D — Infra / ops (whenever convenient, post-demo)

### D.1 — Split Postgres into appdb + mldb (§3.8)
Two-database split to remove the Prisma/SQLAlchemy migration footgun.

```yaml
# docker-compose.yml (sketch)
postgres-app:
  image: postgres:16
  environment:
    POSTGRES_DB: appdb
postgres-ml:
  image: postgres:16
  environment:
    POSTGRES_DB: mldb
```

Then set two env vars:
- `DATABASE_URL=postgres://.../appdb` (Prisma — `backend/.env`)
- `DATABASE_URL=postgres://.../mldb` (SQLAlchemy — `ml/.env`)

### D.2 — Sentry (or alternative)
The new prediction watchdog (§5.1) is intentionally silent on failure.
Hook it up to error tracking so you find out when the explorer is down
in prod. Sentry free tier is enough; otherwise Highlight, Honeybadger,
or even a simple Discord webhook.

Add to both `backend/src/index.ts` and `ml/src/main.py`.

### D.3 — Disk hygiene
After Phase B finishes, you can safely delete:
- `data/raw/*.pgn` (filtered raw PGN per bracket) — about 600 MB.
- `data/processed/*.h5` (training tensors) — about 1.5 GB per bracket.

Keep:
- `data/checkpoints/*/phase1_best.pt` — that's the product.

---

## Phase E — YC demo prep

### E.1 — Screenshots / video
Capture these for the deck:
- The 10-slider style panel with baseline tick marks visible.
- "Play yourself" button on the welcome screen.
- Clone-aware review screen showing the amber "Clone would have played"
  panel on a blundered move.

### E.2 — One-pager
Lift from `PRD.md` §11 directly.

### E.3 — Live demo path
- Open in a clean browser tab (so persistence doesn't leak between
  demos).
- Sign in. Show the linked-chess form.
- Click "Play yourself." Five seconds later the board is ready.
- Make three moves; show the eval bar + the prediction panel.
- Open the style panel; drag aggression to 90; show the next move
  changes character.
- After 10–15 moves, click "Review." Show the clone-aware annotation
  on at least one move.

### E.4 — Things to NOT demo
- Bracket-checkpoint regression — wait until you've run §5.4 yourself.
- Personalize endpoint — same.
- Long predict-think delays — set a known opponent with a built
  profile to keep latency under 1.5s.

---

## Phase F — Pre-launch checklist (do once before going public)

- [ ] `LICHESS_API_TOKEN` in production env
- [ ] Rate limits on `/api/predict` and `/api/players/*` (already 100/min;
  consider tightening for production)
- [ ] Privacy page documenting that public Lichess/Chess.com data is
  fair use, with a delete-my-profile flow
- [ ] Decide pricing (PRD §12.5 — free vs $8/mo)
- [ ] Set up domain + Vercel/Render deployment for the frontend
- [ ] Set up the ML service somewhere with a GPU (Fly.io, Render, EC2)
  or accept CPU latency for v1
- [ ] Postgres + Redis hosted instance (Neon + Upstash, both free tier)

---

## Summary by deadline

If you're presenting at YC Startup School in **≤2 weeks** and have to
pick what to ship:

1. **Today:** Apply A.4 (DB migration), capture E.1 screenshots, write
   E.2 one-pager.
2. **This weekend (if motivated):** Run Phase B (lean training). Costs
   ~$25 of your $50 credit. Unlocks the §5.5 personalize endpoint and
   bumps predict quality.
3. **Pre-YC week:** Tighten the live demo script (E.3). Hook up Sentry
   (D.2).
4. **Post-YC:** Phase C regression, Phase D ops cleanup, Phase F launch
   checklist.

If you don't have time for Phase B, **skip it.** The product still works,
the architecture story is just as strong, and you can pitch "we built
the architecture; training is next." That's a perfectly defensible YC
pitch — most YC startups at the same stage have far less running code.
