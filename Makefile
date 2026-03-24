.PHONY: setup dev dev-local dev-ml dev-backend dev-frontend test lint clean docker-up docker-down

# ── Setup ────────────────────────────────────────────────────────────
setup:
	@echo "Setting up move-predictor..."
	cd ml && pip install -e ".[dev]"
	cd backend && npm install
	cd frontend && npm install
	@echo "Done. Run 'make dev' to start all services."

# ── Development ──────────────────────────────────────────────────────
dev:
	./start-dev.sh

dev-ml:
	cd ml && uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

# ── Docker ───────────────────────────────────────────────────────────
docker-up:
	docker compose up --build

docker-down:
	docker compose down

# ── Testing ──────────────────────────────────────────────────────────
test:
	cd ml && pytest tests/ -v
	cd backend && npm test

test-ml:
	cd ml && pytest tests/ -v

test-backend:
	cd backend && npm test

# ── Linting ──────────────────────────────────────────────────────────
lint:
	cd ml && ruff check src/ tests/
	cd backend && npx eslint src/

# ── Data ─────────────────────────────────────────────────────────────
download-stockfish:
	cd ml && bash scripts/download_stockfish.sh

fetch-data:
	cd ml && python3 scripts/fetch_lichess_data.py

preprocess:
	cd ml && python3 scripts/preprocess_corpus.py

train:
	cd ml && python3 scripts/train.py

# ── Clean ────────────────────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name dist -exec rm -rf {} + 2>/dev/null || true
	rm -rf ml/.pytest_cache backend/coverage frontend/dist .dev-logs
