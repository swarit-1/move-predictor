FROM python:3.11-slim

WORKDIR /app

# Install system dependencies + Stockfish
RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cache layer)
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy source
COPY . .

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
