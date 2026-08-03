# PLAN.md — Move Predictor: Prototype → Product People Pay For

> **This is the ground-truth roadmap.** Every future work session pulls from
> this file. Items are checkboxes so progress is trackable; sections are
> ordered by dependency, not importance. Nothing here is sacred — but if we
> deviate, we update this file so it stays true.
>
> Written 2026-08-02, after the first full training + progressive-clone
> milestone. Companion docs: [PRD.md](PRD.md) (original spec),
> [PRD_PROGRESS.md](PRD_PROGRESS.md) (ledger), [USER_PROGRESS.md](USER_PROGRESS.md)
> (ops runbook).

---

## 0. North Star

**"Play the chess player you actually are — or anyone else — and feel it."**

The magic moment: a user types their own username, waits ≤10 seconds, and
plays a full game against a clone that opens with *their* openings, grabs
material the way *they* do, and blunders in positions where *they* blunder.
They finish the game and think: *"that was uncanny."* Then they share it.

Everything in this plan serves that moment. Features that don't make the
clone more believable, the path to it smoother, or the story more shareable
are cut or deferred.

**One-line positioning for all marketing:**
*"Noctie plays like a human. We play like __you__."*

### 0.1 Current-state scorecard (honest)

| Area | State | Grade |
|---|---|---|
| Core stack (React + Node gateway + FastAPI ML) | All services run, tested end-to-end, committed | B+ |
| Trained model | 3 bracket checkpoints (1000-1200 / 1400-1600 / 1800-2000), val top-1 ~27%, cross-month masked top-1 22.7–25.5% | C+ — works, visibly human, but below the ~50% ceiling Maia proves is reachable |
| Clone fidelity | Progressive pipeline live: repertoire in ~10 s, personalized in ~60–90 s, personal-history prior in every position | B |
| Rating correctness | Lichess + Chess.com pools translated correctly | A- |
| Auth | JWT with a **dev-only fallback secret**, no email verification, no 2FA, no reset flow | D |
| Security posture | Helmet + Zod + rate limit exist; ML service unauthenticated on 0.0.0.0; expensive endpoints unmetered | D+ |
| Deployment | Localhost only (M4 MacBook) | F (by design, so far) |
| Tests | 73 ML + 8 backend, TS clean; no E2E, no load, no model-quality gates in CI | C |
| Monetization | None | — |

The product thesis is validated (the clone is already fun to play). The gap
to "people genuinely use and pay" is: **model accuracy, seamlessness under
load, trust (auth/security), distribution, and a reason to come back.**

---

## 1. The Flagship Experience: "Play Yourself" — Exact Spec

This is the feature we market. It must be flawless before anything else ships.

### 1.1 The seamlessness contract (latency budgets)

| Step | Budget | Today | Fix |
|---|---|---|---|
| Username typed → autocomplete suggestion | < 300 ms | ~400 ms (Lichess proxy) | cache + debounce |
| "Play yourself" click → board playable | **< 3 s** | ~1 s (Stage 0 generic clone) | ✅ keep |
| Profile artifacts live (book + explorer + style) | < 12 s | ~8–15 s | parallelize fetch + stats |
| Personalized embedding active | < 90 s, invisible (badge flips mid-game) | ~60–90 s | ✅ keep; move to job queue |
| Clone move latency (p95, incl. think-time theatre) | < 1.5 s compute; displayed think time is *modeled*, not compute-bound | ~0.3–1 s local | keep ONNX/CPU budget ≤ 300 ms in prod |
| Full-history deep profile (Chess.com PubAPI crawl) | background, < 10 min, notify on completion | not built | build (§4.2) |

- [ ] Instrument every step above with real timings (frontend `performance.mark`
      + backend timing middleware + ML `X-Inference-Ms` header).
- [ ] Kill all cold-start jank: preconnect, model warm on deploy, Stockfish
      pool pre-spawned, first-predict warmup request at boot.
- [ ] Never block the board: every enhancement arrives via the clone-status
      badge (already shipped). If Lichess/Chess.com is down or 429s, the game
      still starts at Stage 0 and the badge says "profile delayed — retrying."

### 1.2 The believability bar (this is the real product metric)

"High accuracy + technically a challenge" translates to measurable targets:

| Metric | Definition | Target v1.0 | Today |
|---|---|---|---|
| **Move-match top-1** | clone's argmax = player's actual move, cross-month held-out | **≥ 33%** (path to 40%+ in §2) | 22.7–25.5% |
| **Move-match top-3** | actual move in clone's top 3 | ≥ 55% | ~45% (est.) |
| **Strength calibration** | clone's measured Elo (vs Stockfish-limited ladder, 100 games) within ±100 of target | ±100 Elo | unmeasured |
| **Blunder realism** | clone blunder rate within ±25% relative of the bracket's real rate, and blunders are *human-typed* (hung pieces, missed tactics) not random | pass | partially (blind spots + error head) |
| **Opening fidelity** | ≥ 70% of clone games open inside the player's actual repertoire (for players with ≥ 30 games) | ≥ 70% | high (book + prior) — measure it |
| **Turing panel** | blind A/B: show 20 games (10 clone-vs-engine-limited, 10 real player games) to 3 club players; they identify the clone no better than 65% | pass | untested |

- [ ] Build `scripts/believability_report.py`: given a username, runs all five
      measurements and emits a one-page scorecard. This becomes the release
      gate for any model change *and* marketing material ("your clone scored
      87% believability").
- [ ] Add self-play Elo ladder: clone vs Stockfish at fixed skill levels,
      binary-search its rating. Run per bracket per release.

### 1.3 Think-time realism (cheap, huge believability win)

Humans don't move in constant time. We already have `[%clk]` data in every
training game — use it.

- [ ] Train a tiny think-time head (or a lookup model: position complexity ×
      phase × time-remaining → sampled think time). Data is already in the
      corpus PGNs.
- [ ] Blitz clone snaps out book moves in <1 s, tanks 15–40 s on sharp
      middlegame decisions, speeds up in time trouble (and errs more — the
      time_pressure path already exists).
- [ ] Premove-like instant recaptures on forced sequences.

### 1.4 Endgame + game-end behavior

Nothing breaks immersion like a clone that shuffles pieces in K+Q vs K.

- [ ] Integrate Syzygy tablebases (≤5 men) behind a "human filter": play the
      tablebase-best line but at rating-scaled accuracy (a 1200 clone should
      still botch some K+P endings — sample from tablebase-win-preserving
      moves with rating-scaled noise; a 2000 clone converts cleanly).
- [ ] Resignation model: humans resign lost positions. Resign when eval < -6
      for N consecutive moves, with probability scaled by rating and rated by
      the player's actual resignation habits (derivable from their games).
- [ ] Draw offers/acceptance modeled the same way.
- [ ] Fifty-move/threefold awareness: never let the clone accidentally draw a
      completely winning position (this reads as a bug, not as human).

---

## 2. Model Quality Roadmap (the accuracy engine)

Every point of top-1 accuracy makes the whole product better. Ordered by
expected accuracy-per-effort:

### Phase M1 — Squeeze the current recipe (1 week, no architecture change)
- [x] **More epochs** (M1 pipeline in flight): resume all three brackets +2–4 epochs (epoch 2 added
      +4.3 pts; expect +3–5 more). Overnight jobs, already scripted.
- [ ] **More data**: 48k → 150k games/bracket (downloads are ~2 min per
      bracket; preprocessing ~30 min; disk ~45 GB — prune after).
- [x] **Fill remaining brackets** (M1 pipeline in flight): 400-800, 800-1000, 1200-1400, 1600-1800,
      2000-2200, 2200-2500 so nearest-bracket fallback is never > 100 Elo off.
- [ ] Expected landing: **top-1 30–34%** cross-month.

### Phase M2 — Stats-conditioned single model (Maia-2 style; the v2 unlock)
- [ ] Extend the preprocessor to compute the real 33-dim stats vector per
      player in the corpus (players with ≥ 20 games in the month; else
      rating-only). This is the missing piece that makes the style vector a
      *learned* conditioning signal instead of a masked one.
- [ ] Train one model across all brackets, conditioned on stats + rating.
      Result: **instant personalization for any new player** (compute stats →
      feed vector), no fine-tune wait, and cross-bracket knowledge sharing.
      Phase-3 embedding fine-tune becomes a premium bonus, not load-bearing.
- [ ] This is a rented-GPU job (~$30–60 on an A100 for the full corpus — the
      original USER_PROGRESS budget finally spent well) or 3–4 overnight M4
      runs at reduced scale.
- [ ] Expected landing: **top-1 36–42%**, plus visibly sharper style transfer.

### Phase M3 — Frontier polish (post-revenue)
- [ ] History-aware attention over longer context (24 half-moves).
- [ ] Per-move time features as model *input* (time left, increment) — we
      already store TC; add remaining-clock channels.
- [ ] Distill to a small ONNX student (<2 M params) for client-side inference
      (kills server cost for free-tier games; see §8 cost model).
- [ ] Periodic retraining pipeline (monthly dumps → auto retrain → eval gates
      → promote checkpoint).

### Model-quality guardrails (build once, run forever)
- [ ] `eval_harness` + believability report wired into CI as a **release
      gate**: a checkpoint ships only if top-1, calibration, and blunder
      realism don't regress.
- [ ] KL divergence between predicted and observed move distributions per
      bracket tracked release-over-release (the PRD's original north-star
      metric — implement it for real).

---

## 3. Optimizations to Current Features

### 3.1 Inference & serving performance
- [x] **Export to ONNX Runtime (CPU)** — DONE 2026-08-03 (`ml/scripts/export_onnx.py`, parity 2e-5; M4 batch-1: torch-CPU 6.8 ms / ORT fp32 7.4 ms on 2 threads; int8 48 MB but slower on ARM — use fp32 until memory-bound). Original note: the 48 M-param model at batch 1 should
      run ≤ 60 ms on 2 vCPUs quantized (int8). This removes the GPU
      requirement for production entirely and is the single biggest
      cost/latency lever. Benchmark torch-CPU vs ONNX vs ONNX-int8.
- [ ] **Per-bracket resident models**: today one singleton swaps checkpoints
      per request rating (fine for one user, thrashes with two concurrent
      users in different brackets). Keep N brackets resident (ONNX makes them
      ~50 MB each) and route per request. Delete the load-lock dance.
- [ ] Cache Stockfish analyses in Redis keyed by (fen, depth) — the pool
      recomputes identical openings thousands of times. (Cache layer exists;
      verify hit rates, add metrics.)
- [ ] Precompute engine analysis for the 10k most common positions offline;
      ship as a static table.
- [ ] Frontend: code-split the 826 kB bundle (lazy-load Review/Practice/
      Replay/Coach routes; Recharts and react-chessboard are the heavies).
      Target < 250 kB initial.
- [ ] HTTP keep-alive + gzip between gateway↔ML (verify axios/uvicorn config).

### 3.2 Feature-by-feature hardening (make every advertised feature *actually* delightful)

**Game screen**
- [ ] Premoves; drag *and* click-move; move sounds on by default with a mute.
- [ ] Reconnect-safe games: every move persisted server-side (see §8 sessions)
      so a refresh mid-game resumes flawlessly (persistence exists client-side;
      make it server-authoritative).
- [ ] Eval bar off by default vs your clone (it leaks the challenge) — one
      click to reveal. "Casino mode": guess-the-eval mini-widget.
- [ ] Rematch button with color swap; series score (you 2 – 1 clone).

**Game review / opening review**
- [ ] Review must work on *every* finished game with zero setup: auto-queue
      analysis at game end so the review is warm when they click.
- [ ] "Clone would have played" annotations (shipped) — surface them in the
      review summary, not just per-move: "You deviated from your own style 4
      times; 3 of those were mistakes."
- [ ] Opening practice: after review, one-click "drill this line vs your
      clone" (practice mode exists; wire the deep link from review).
- [ ] Accuracy graph vs your historical average ("today you played 12 points
      above your usual").

**Profile / setup**
- [ ] Username autocomplete for Chess.com too (PubAPI has no autocomplete —
      validate-on-blur with a friendly "exact spelling needed" state, which
      partially exists; add existence pre-check).
- [ ] Show profile-build progress as real steps (fetching games 40/100 →
      computing style → indexing positions) via SSE instead of a spinner.
- [ ] Graceful 429 story: "Lichess is rate-limiting us; your clone will
      finish building in ~2 min" + automatic retry with backoff (today it
      surfaces as a failed build).
- [ ] Cache built profiles for 7 days (Redis TTL exists — confirm + surface
      "profile from 3 days ago — refresh?" chip).

**Coach mode**
- [ ] Reframe output as 3 concrete weekly focus items ("You hang knights on
      f5-type squares — 9 times in 40 games") instead of raw pattern lists.
- [ ] Link each weakness to a "train this vs your clone" drill.

### 3.3 Mobile app
- [ ] Bring the Expo app to parity with the new features (clone badge,
      rating-pool toggle, progressive status). Single API already shared.
- [ ] App-store screenshots/ASO are part of launch (§10), not an afterthought.

---

## 4. New Features (ranked backlog)

Scoring: Impact on north star × virality ÷ effort. Build top-down.

| # | Feature | Why | Effort |
|---|---|---|---|
| F1 | **Share your clone** — public link `movepredictor.gg/vs/lichess/magnus` lets *anyone* play your clone (or theirs) with zero signup | The viral loop. "Play ME" is the most shareable object in chess since puzzle-rush screenshots | M |
| F2 | **Clone vs clone** — pick any two players, watch them play with live commentary-style eval graph; export as video/GIF | Content machine: "Magnus's clone vs Hikaru's clone" writes our TikToks for us | M |
| F3 | **Beat-your-clone ladder** — persistent series record; clone silently retrains monthly from your new games; "your November self vs your March self" | Retention: a reason to return monthly | M |
| F4 | **Blunder-derived puzzles** — mine the user's real games for their 20 worst moments; drill them as puzzles; then replay the position vs their clone | Converts our review data into the #1 requested training format | M |
| F5 | **Famous-player gallery** — pre-built clones of ~50 public figures (top GMs, streamers) with believability scores | Zero-friction first taste for users without accounts; SEO pages per player | S (build cost) / careful (legal §11) |
| F6 | Weekly recap email — "your clone's week": games played vs you, your accuracy trend, one weakness | Retention + re-engagement channel | S |
| F7 | Tournament mode — 8-clone round-robin from any mix of usernames; bracket + PGN export | Community events; streamers love brackets | M |
| F8 | **Coach marketplace hook** — a coach builds clones of their students, plays "what my student would do here" in lessons | The first B2B revenue wedge (coaches pay for tools) | M |
| F9 | Embeddable widget — `<iframe>` your clone for personal sites/Twitch panels | Distribution surface | S |
| F10 | Discord bot — `/challenge @user` builds their clone into a playable channel game | Where chess communities live | M |
| F11 | Voice/personality layer — clone "talks" in post-game recap ("I knew you'd take the bait on h5, you always do") | Delight; shareable screenshots | S–M |
| F12 | Public API + rate-limited free tier | Dev ecosystem, long tail | S |

Explicitly deferred: engine-strength play (Lichess is free and better),
opening encyclopedias (commodity), general social network features.

---

## 5. Testing Strategy (simulate what real users will do to us)

### 5.1 Chess-domain edge cases (unit/property tests, ML + backend)
The board is where weird lives. Exhaustive list to encode as tests:

- [x] Promotions: all 4 pieces × capture/non-capture × discovered check;
      underpromotion to knight delivering mate.
- [x] En passant: legality window (only immediately after), en passant that
      *resolves* check, en passant pinned-pawn illegality.
- [x] Castling: all rights permutations; castling through/into/out of check
      rejected; rights lost by rook capture *at* the rook square.
- [x] Draw states: stalemate, threefold (incl. rights/en-passant nuances in
      repetition detection), fifty-move, insufficient material (K vs K, KB vs
      K, KN vs K, KB vs KB same color).
- [ ] Clone never plays into avoidable stalemate when completely winning;
      never misses mate-in-1 above 1600 (behavioral tests over 500 sampled
      positions per bracket — extend the existing sampler test suite).
- [x] FEN fuzzing (ml edge suite + backend fen-fuzz; CAUGHT REAL BUG: rank-7→8 non-pawn moves unencodable — fixed via shared-slot semantics): property-test the validators (backend `isValidFen` and ML
      `chess.Board(fen)`) with hypothesis/fast-check — malformed, unicode,
      1 MB strings, valid-but-absurd positions (9 queens), side-not-to-move
      in check.
- [ ] PGN upload fuzzing: truncated files, null bytes, 100 MB files (multer
      limits!), PGN with embedded HTML/script in headers (XSS vector via
      rendered player names), recursive variations, 10k-game files.
- [ ] Move-history desync: client sends history inconsistent with FEN —
      server must recompute/reject, never trust (audit `_encode_history`).

### 5.2 User-journey integration tests (Playwright E2E)
- [ ] Golden path: search self → build profile → play 10 moves → badge flips
      to Personalized → finish game → review loads → drill opening.
- [ ] Refresh mid-game at every phase (the PRD's original P0 bug — keep it
      dead with a test).
- [ ] Two tabs, two different opponents simultaneously (bracket routing).
- [ ] Slow-network (Playwright throttling) and offline-blip runs.
- [ ] Mobile-viewport run of the full golden path.

### 5.3 Failure-mode tests (chaos)
- [ ] ML service down → banner + retry (exists) — assert in E2E.
- [ ] Redis down → predictions still work (no-cache path), profiles rebuild.
- [ ] Lichess/Chess.com 429/500/timeout mid-build → staged clone still plays;
      background retry completes it. (Mock upstream with WireMock/msw.)
- [ ] Stockfish process crash mid-analysis → pool respawns (test the pool).
- [ ] Checkpoint file corrupt/missing → clean fallback + alert, not a 500.

### 5.4 Load & abuse simulation (k6)
- [ ] 200 concurrent games, p95 move latency < 1.5 s (drives §8 architecture).
- [ ] 50 simultaneous profile builds (the expensive path) → queue depth
      bounded, UI shows queue position, no OOM.
- [ ] One IP spamming predict at 100 rps → limited without collateral damage
      to others (per-key limits, §7).
- [ ] Soak test: 24 h at moderate load; memory flat (watch the in-memory
      session map, personalization cache, explorer indexes).

### 5.5 Model-quality regression (CI gates)
- [ ] Nightly: eval harness on pinned held-out set; alert on >1 pt top-1 drop.
- [ ] Per-PR (ML paths): 64+ existing tests + sampler behavioral suite +
      5-game smoke sim completing legally.
- [ ] Golden-output snapshots: fixed seed + fixed checkpoint → byte-identical
      top-5 for 20 reference positions (catches accidental logit changes).

---

## 6. Auth & Account Workflow (trust before money)

Current: JWT with `dev-only-insecure-secret-do-not-use-in-prod` fallback,
bcrypt hashing exists, no verification/reset/2FA. Target flow:

### 6.1 Core flows
- [x] **Signup** (verification links live; zxcvbn/HIBP open): email + password (zxcvbn strength meter, HIBP breach check)
      → verification email (signed, 24 h expiry) → unverified accounts can
      play but not save/personalize (don't block the magic moment).
- [x] **Login** (done incl. anti-enumeration + dummy-hash timing): rate-limited (5 fails → exponential backoff + captcha at 10;
      per-account *and* per-IP), generic error messages (no user enumeration
      — same response for wrong-user and wrong-password).
- [x] **Password reset** (done): single-use token, 30 min expiry, invalidates all
      sessions on success, notification email on change.
- [x] **2FA (TOTP)** (done; WebAuthn open): authenticator-app enrollment with QR + manual key,
      10 single-use recovery codes (shown once, hashed at rest), required
      re-auth (password) to enable/disable, optional "remember this device
      30 days" cookie (separate signed token). SMS explicitly rejected
      (SIM-swap risk, cost). WebAuthn/passkeys as fast-follow — it's 2026,
      passkey-first signup is now table stakes for new apps.
- [ ] **OAuth**: "Continue with Lichess" (their OAuth2 supports this) — one
      click AND it proves account ownership for claiming your own clone
      (anti-impersonation, §11). Google second.
- [ ] **Sessions**: short-lived access JWT (15 min) + rotating refresh token
      (httpOnly, Secure, SameSite=Lax cookie), server-side revocation list,
      "log out everywhere," active-sessions page with device/IP.
- [ ] **Account page**: change email (re-verify), export my data (JSON),
      delete my account (soft 14-day, then hard — including built profiles
      and personalizations; the privacy promise in USER_PROGRESS made real).

### 6.2 Authorization model
- [x] Roles (done): `user`, `admin`. Admin: user management, clone takedown/opt-out
      list, feature flags, job queue dashboard.
- [ ] Object-level checks everywhere (OWASP #1 is Broken Access Control):
      saved games, personalizations, and sessions are owner-scoped — write
      the middleware once, test with an IDOR suite (user A requests user B's
      resources by ID must 404, not 403, to avoid resource enumeration).
- [ ] The ML service trusts the gateway blindly today. In prod: private
      network + shared-secret header (mTLS later); never expose :8000.

---

## 7. Security: Audit of Today's Code + Hardening Plan

Framework: OWASP Top 10 (2025 edition — Broken Access Control still #1,
expanded supply-chain category) as the awareness list, **ASVS 5.0 Level 2**
as the verification checklist we actually audit against, chapter by chapter.

### 7.1 Security audit — current findings (do these before ANY public traffic)

| # | Severity | Finding (file) | Fix |
|---|---|---|---|
| S1 | **Critical** | JWT secret falls back to a hardcoded dev string outside production (`backend/src/config.ts`) — anyone can forge tokens if NODE_ENV is mis-set | Require `JWT_SECRET` always; crash on missing; 256-bit random; rotate on schedule |
| S2 | **Critical** | ML service binds `0.0.0.0:8000` with zero auth — full predict/train/personalize surface exposed to any network peer | Bind localhost in dev; private network + auth header in prod; firewall rule as belt-and-braces |
| S3 | **High** | Lichess API token lives in `.env` and was pasted into logs/chat during development | **Rotate the token now**; move to a secrets manager (even `direnv` + 1Password CLI locally; provider secrets in prod); add gitleaks to CI |
| S4 | **High** | Expensive endpoints (`build-profile`, `personalize`, `review`, `coach`) are unauthenticated and unmetered — one loop = our Stockfish pool, our Lichess quota, and our CPU are gone | Per-user + per-IP quotas (see 7.2); job queue with per-user concurrency 1; anonymous users get N free builds/day by IP |
| S5 | **High** | Postgres runs `postgres:postgres` on published ports 5432/5433 (`docker-compose.yml`) | Strong generated passwords; don't publish ports in prod compose; managed DB for real deploy |
| S6 | **Medium** | Usernames are interpolated into upstream URLs and Redis keys. ML side uses f-strings (`f"...{username}/games/archives"`) — a username like `../admin` or one with spaces/newlines could smuggle paths or split keys | Single `validate_username()` at every boundary: `^[A-Za-z0-9_-]{2,32}$` (matches both sites' rules), reject otherwise; URL-encode when building requests (backend already does; ML must too) |
| S7 | **Medium** | CORS is wide open (`app.use(cors())`) | Allowlist our origins in prod; keep permissive only in dev |
| S8 | **Medium** | PGN upload path: verify multer file-size limit, reject >5 MB, parse with a hard game-count cap, and treat all PGN header strings as untrusted display text (XSS if ever rendered outside React's escaping) | Limits + sanitize-on-render policy + fuzz suite (§5.1) |
| S9 | **Medium** | Rate limit is one global 100/min/IP bucket — trivially consumed by one bad actor per IP, and shared NAT users get locked out together | Tiered: cheap endpoints 300/min, predict 60/min, expensive 5/hr anonymous / 30/hr authed; keyed by user-id when authed, IP otherwise |
| S10 | **Medium** | `/ml/training/*` endpoints exist in prod surface (return 501 but shouldn't exist publicly) | Route them admin-only or compile out in prod |
| S11 | **Low** | Simulate sessions: unauthenticated creation, in-memory, MAX 1000 with LRU — a griefer can evict everyone's live games | Session creation quota per IP; move store to Redis with per-user namespacing (§8) |
| S12 | **Low** | Error handler leaks internal messages (`error.message` passthrough in several routes) | Generic client errors + structured server logs; error IDs for support |
| S13 | **Low** | No dependency scanning; npm/pip supply chain unmonitored (2025 Top 10 explicitly expanded here) | `npm audit` + `pip-audit` + Dependabot + lockfile-only installs in CI |

### 7.2 Hardening program (recurring, not one-shot)
- [ ] **Input validation ledger**: one Zod schema per route (mostly done on
      backend — complete it: games.ts import params, review depth caps
      (`depth ≤ 22`, `moves.length ≤ 500`), coach `max_games ≤ 100`), one
      Pydantic model per ML route with the same caps. Validation at *both*
      layers (gateway AND ml) — defense in depth, since S2 means the ML
      service must survive direct hostile input.
- [ ] Output encoding: React escapes by default — add an ESLint ban on
      `dangerouslySetInnerHTML`; sanitize PGN-derived strings in emails/OG
      images (different renderers!).
- [ ] Security headers: keep Helmet; add strict CSP (no inline scripts —
      Vite build supports nonce), HSTS, COOP/COEP where embeddable widget
      (F9) doesn't conflict.
- [ ] Secrets: provider-managed (Fly/Render secrets, GitHub Actions OIDC);
      gitleaks pre-commit + CI; quarterly rotation calendar.
- [ ] Logging + alerting (2025 Top 10 pairs them): structured logs with user
      id, auth events (login fail bursts, 2FA disable, password change),
      quota trips, 5xx spikes → Sentry alerts + a #ops channel. Never log
      passwords, tokens, or full PGNs with emails.
- [ ] Backups: nightly Postgres snapshot, weekly restore *drill* (a backup
      you've never restored is a rumor).
- [ ] Abuse review: monthly look at top consumers of expensive endpoints.
- [ ] Pre-launch: run OWASP ZAP baseline scan + one manual pass following
      ASVS 5.0 L2 checklists (authn, session, access control, validation
      chapters minimum). Post-revenue: paid pentest + a `security.txt` +
      simple VDP ("email security@, we respond in 72 h, no legal threats").

---

## 8. Architecture: Localhost → Production (the "revamp" discussion)

**Verdict: no rewrite.** The 3-service shape (SPA → Node gateway → Python ML)
is exactly right and survives to v1.0. What must change is *statefulness,
concurrency, and where it runs* — an ops revamp, not a code revamp.

### 8.1 Target v1.0 topology

```
Cloudflare (DNS, CDN, WAF, rate-limit backstop)
   │
   ├── Frontend: static SPA on Vercel/Cloudflare Pages
   │
   ├── api.movepredictor.gg → Node gateway (Fly.io/Render, 2× shared-cpu,
   │      autoscale) — auth, quotas, sessions, Stripe webhooks
   │        │
   │        ├── Managed Postgres (Neon): users, saved games, personalizations,
   │        │      profiles-metadata  (replaces BOTH sqlite + dual-postgres;
   │        │      one DB, two schemas — the §3.8 split becomes schemas, not
   │        │      instances)
   │        ├── Managed Redis (Upstash): cache, job queue, live game state
   │        │      (replaces in-memory session Map — survives deploys)
   │        │
   │        └── ML service (Fly.io machines, 2–4 vCPU, ONNX int8, no GPU):
   │               ├── N resident bracket models (~50 MB each quantized)
   │               ├── Stockfish pool (nice-level capped)
   │               └── worker process: profile builds, personalize, review
   │                     jobs from Redis queue (BullMQ/arq) — API replicas
   │                     stay latency-clean
   └── R2/S3: checkpoints, monthly eval reports, share-card images
```

Key changes ranked by urgency:
- [ ] **Job queue** for build/personalize/review/coach (arq or BullMQ). The
      API process must never run a 60 s training loop again (thread trick was
      a stopgap). Queue gives retries, per-user concurrency, and a progress
      channel (SSE) for free.
- [ ] **Game state to Redis** with ownership + TTL (fixes S11, enables
      reconnect-anywhere and server-authoritative games).
- [ ] **ONNX CPU inference** (§3.1) — this is what makes hosting ~$50/mo
      instead of ~$500/mo (GPU). MPS Mac never serves production traffic.
- [ ] **WebSocket (or SSE) for game + status streams** — polling clone-status
      every 5 s and predict round-trips are fine solo, wasteful at scale.
      Gateway holds the socket; ML stays HTTP.
- [ ] **CI/CD**: GitHub Actions — lint, both test suites, E2E on preview
      deploy, model-gate job (pinned eval set), then promote. Staging env =
      production topology at minimum scale.
- [ ] **Observability**: Sentry (both runtimes) + OpenTelemetry traces
      gateway→ML→stockfish + uptime checks + the latency budgets of §1.1 as
      dashboards with alerts.

### 8.2 Cost model (why this works as a business)

| Monthly actives | Infra (est.) | Notes |
|---|---|---|
| 0–500 | ~$40–70 | Fly shared CPUs, Neon/Upstash free tiers, R2 pennies |
| 5k | ~$200–400 | 2–3 ML machines, paid Redis/PG tiers |
| 50k | ~$1.5–3k | autoscaled ML pool; client-side distilled model (M3) cuts this hard |

A single $8/mo subscriber covers ~their weight at every tier — margins are
software-margins as long as we stay off GPUs (hence ONNX + distillation).

---

## 9. Monetization

Comparables: Chess.com Diamond ~$14/mo, Aimchess ~$6–10/mo, Chessy $7.99/mo,
Noctie subscription-gated play. Lichess free sets the floor: *never charge
for what Lichess gives away* (analysis, puzzles, engine play).

### 9.1 Tiers

**Free (the funnel — generous where it's viral, capped where it costs us):**
- 3 clone games/day vs any opponent (enough to feel the magic + share)
- Full "play yourself" experience including personalization (never paywall
  the flagship moment — activation is worth more than the compute)
- Basic review (depth-12, top-1 line); famous-player gallery; shared-clone
  links always playable by guests (F1 is the growth engine — free forever)

**Pro — $7/mo or $56/yr (anchor low vs Chess.com, above impulse-trash):**
- Unlimited clone games; deep review (depth-18–22, 3 lines, clone-aware
  annotations); blunder-puzzle packs (F4); coach mode; beat-your-clone ladder
  + monthly clone retrain (F3); think-time realism + tablebase endgames
  toggles; weekly recap; priority job queue; clone-vs-clone tournaments (F7)

**Coach/Team — $25/mo (later, after F8):** 10 student clone slots, lesson
mode, shared review workspace.

### 9.2 Mechanics
- [ ] Stripe Checkout + customer portal (no custom billing UI), webhook-driven
      entitlements table, grace on failed payment, refunds no-questions ≤ 14 d.
- [ ] Paywall UX: soft — hitting the cap shows *the thing you'd get*, never a
      dead end ("your clone wants a rematch — Pro unlocks unlimited games").
- [ ] Launch pricing: 40% off first year for the first 500 ("Founding
      member" badge on profile) — urgency + early revenue + forgiveness while
      rough.
- [ ] Instrument price sensitivity from day one (track cap-hit → upgrade
      conversion per surface); revisit price at 90 days with data.

---

## 10. Launch & Growth ("get people to notice me")

Research-backed premises (sources in §13): single-platform launches are
weak in 2025-26 — Product Hunt converts ~3% vs community channels ~20%+;
PH's algorithm now rewards steady momentum over vote-bursts; HN wants plain
technical titles; journey-posts with real numbers outperform ads everywhere.

### Phase L0 — Pre-launch (runs parallel to engineering, start NOW)
- [ ] Domain + name check (is "Move Predictor" ours? consider a game-y name;
      check trademark/socials availability) → landing page with a **live
      famous-clone demo** (no signup) + waitlist email capture.
- [ ] Build in public: 2 posts/week (X + a dev blog): training-run
      war-stories, believability scores, clone-vs-clone clips. The M4
      overnight-training story and "my clone plays my exact Caro-Kann" clip
      are genuinely good content — post them.
- [ ] Seed 20–50 waitlist users from r/chess & chess Discords for a closed
      beta; their games harden the pipeline (§5) and their quotes become the
      landing page.
- [ ] Produce the hero asset: 45-second screen video — type username, badge
      flips to Personalized, clone opens with *your* opening, side-by-side
      with your real game. This one video is the whole pitch.

### Phase L1 — Launch week (only after §6 auth + §7 S1–S9 are done)
- [ ] **Tuesday/Wednesday**, morning Pacific. Same-week rollout:
  - Show HN: plain title — *"Show HN: I trained a chess bot to play like you,
    specifically (open training pipeline)"* + a first comment with the
    architecture story and honest accuracy numbers. HN respects candor about
    the 33% ceiling and the M4-laptop training grind.
  - Product Hunt with staged outreach through the day (no vote-burst);
    maker comment = the believability methodology.
  - Reddit r/chess: "I built a bot that clones your play style — roast my
    clone" thread, play challengers' clones live in comments all day.
  - Indie Hackers journey post with real revenue/infra numbers; Uneed /
    MicroLaunch / SaaSHub / DevHunt same week.
- [ ] Streamer/YouTuber seeding: build clones of 10 mid-size chess creators
      (10k–200k subs) *with permission*, send each a private "play yourself"
      link. One "I played MYSELF and lost" video outperforms any launch post.
      (Levy/agadmator tier later — credibility first.)
- [ ] Press kit page: logo, screenshots, believability methodology, founder
      story ("trained overnight on a MacBook").

### Phase L2 — Post-launch loops (the actual growth engine)
- [ ] **The share loop (F1/F2)**: every finished game offers a share card
      (board GIF + "I beat my own clone 3–1") with a challenge link. Every
      shared clone page converts viewers → players → sharers. Measure
      K-factor; target > 0.3 initially.
- [ ] SEO: per-famous-player clone pages (opt-in/public-figure list),
      "play against [opening] like a 1500" programmatic pages.
- [ ] Community: Discord with weekly clone-tournament nights (F7 feeds this).
- [ ] Email: weekly recap (F6) is retention; monthly "your clone got
      stronger — rematch?" is resurrection.
- [ ] Metrics dashboard (define now, before launch):
      **Activation** = completes first game vs own clone (target 40% of
      signups); **D7 retention** target 20%; **share rate** target 15% of
      finished games; free→Pro conversion target 3–5%; churn < 6%/mo.

---

## 11. Legal, Privacy, Ethics (the clone question)

- [ ] **API ToS compliance**: Lichess API is permissive (attribution +
      rate-respect; we already honor tokens/limits — add attribution in
      footer). Chess.com PubAPI is for **personal, non-commercial-ish use
      cases with restrictions** — *action item*: re-read current PubAPI terms
      before charging money for Chess.com-derived clones; if restrictive,
      Chess.com stays a free-tier-only source or we seek permission. Do not
      skip this — it's existential for the Chess.com half of the funnel.
- [ ] **Impersonation policy**: clones are simulations of *public game data*,
      always labeled "AI simulation of [username]'s style — not affiliated."
      Opt-out endpoint honored within 48 h (delete profile artifacts +
      personalization + block rebuilds). Claiming your own username via
      Lichess OAuth (§6.1) gives you control of your clone's visibility.
      Famous-player gallery (F5) restricted to public figures, with removal
      on request.
- [ ] Privacy policy + ToS (use a generator + one lawyer-hour): we store
      public game data, derived stats, account email; full export + delete
      (§6.1 flows). GDPR/CCPA basics: lawful basis = legitimate interest for
      public game data, consent for accounts; DPA list (Neon, Upstash, Fly,
      Stripe, Sentry, email provider).
- [ ] Age: 13+ in ToS, no targeted-child marketing (COPPA hygiene).
- [ ] Rename note: "Move Predictor" is descriptive/genericky — if we rebrand
      (worth considering pre-launch, §10 L0), do it before the domain,
      handles, and press kit exist.

---

## 12. Sequencing: 12-Week Plan to Launch

**Weeks 1–2 — Model sprint (M1) + prod skeleton**
Retrain all 9 brackets bigger; ONNX export + CPU benchmarks; Fly/Neon/
Upstash accounts; CI green wall (tests + typecheck + gitleaks).
*Exit: top-1 ≥ 30%, ONNX p95 ≤ 100 ms, staging deployed.*

**Weeks 3–4 — Security + auth (S1–S9, §6 core)**
Full auth flows incl. TOTP 2FA; quotas + job queue; validation ledger; ZAP
baseline clean. *Exit: an internet stranger can sign up safely; no Critical/High
findings open.*

**Weeks 5–6 — Seamlessness (§1) + feature hardening (§3.2)**
Latency instrumentation, SSE progress, think-time realism, resign model,
server-authoritative games, review auto-queue. *Exit: golden-path E2E green
incl. mid-game refresh; believability report exists and runs.*

**Weeks 7–8 — Growth surfaces**
F1 share-your-clone, F2 clone-vs-clone + share cards, famous gallery (F5,
with permissions), landing page + hero video. *Exit: a guest can play a
shared clone with zero signup; K-loop instrumented.*

**Weeks 9–10 — Monetization + closed beta**
Stripe, caps, Pro entitlements; 50-user beta hammers everything; load tests
(§5.4) pass; Phase M2 training run queued on rented GPU. *Exit: first paid
conversion in beta; p95 budgets hold at 200 concurrent.*

**Weeks 11–12 — Launch (L1)**
Freeze features; polish + copy; streamer seeding; launch week; live-ops.
*Exit: launched, dashboards green, first 100 paying-or-sharing users.*

Solo-founder reality check: this is aggressive. If weeks slip, cut from the
bottom of §4, never from §6/§7 (trust) or §1 (the product).

---

## 13. Risks & Open Questions

| Risk | Likelihood | Mitigation |
|---|---|---|
| Chess.com PubAPI terms block commercial use | Medium | §11 action item week 1; Lichess-first funnel; permission outreach |
| Accuracy plateau makes clones feel generic above 1800 | Medium | M2 conditioning; be honest in marketing (believability score per clone); strength calibration matters more than move-match to feel |
| Chess.com ships a "play your bot" feature | Medium | Speed + personality + cross-platform; they're slow on Lichess users; our openness (open training pipeline) is differentiation they can't copy |
| Lichess rate limits throttle profile builds at scale | High | Token pool, aggressive caching, monthly-dump fallback for bulk stats, queue smoothing |
| One-person bus factor | Certain | This file; boring tech; managed services; runbooks in USER_PROGRESS |
| Clone of a real person used for harassment | Low/High-impact | §11 labeling + opt-out + claiming; no DMs/impersonation surfaces |

Open questions to resolve deliberately (decision log below): final name,
passkeys at launch vs fast-follow, famous-gallery legal review depth,
client-side model as free tier (M3) timing.

**Decision log** (append-only):
- 2026-08-02: Plan adopted. Architecture: keep 3-service shape, ops revamp
  only. Pricing anchor $7/mo. Chess.com corpus training rejected (Lichess
  dumps superior); PubAPI reserved for per-user depth.

---

## 14. References (research inputs for this plan)

Launch strategy: multi-platform > PH-only, ~3% PH vs ~20%+ community
conversion, PH momentum algorithm, HN plain-title norms —
[DEV technical launch guide](https://dev.to/lightningdev123/beyond-product-hunt-a-technical-launch-guide-for-2026-i2j),
[Indie hacker PH guide](https://launchdirectories.com/blog/indie-hacker-guide-to-a-winning-product-hunt-launch),
[Indie Hackers launch data](https://awesome-directories.com/blog/indie-hackers-launch-strategy-guide-2025/),
[PH featured lessons](https://www.indiehackers.com/post/i-launched-2-apps-on-product-hunt-and-both-were-featured-heres-what-i-learned-0b24c76a3a).
Security framework: OWASP Top 10 2025 (Broken Access Control #1, supply
chain + logging/alerting emphasis), ASVS 5.0 as the verification standard —
[OWASP Top 10:2025 overview](https://insecm.ca/en/newsletter/owasp-top-102025-whats-new-and-why-it-matters/),
[ASVS 5.0 developer guide](https://www.securecodinghub.com/blog/owasp-asvs-developers-complete-guide),
[OWASP Top 10 remediation](https://www.sentinelone.com/cybersecurity-101/cybersecurity/owasp-top-10/).
Market/pricing comparables: Aimchess ~$6–10/mo, Chessy $7.99/mo, Noctie
(human-like opponents; nearest competitor), Lichess free baseline —
[Aimchess App Store](https://apps.apple.com/us/app/aimchess-learn-chess-online/id1524941307),
[chess app comparison](https://chessyapp.com/guides/best-chess-improvement-app),
[training tools roundup](https://aa-chess.com/blogs/sharing/best-chess-training-apps-tools-2025).
