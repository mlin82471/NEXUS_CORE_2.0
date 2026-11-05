# NEXUS CORE 2.0 — Production Docker Image
FROM python:3.11-slim-bookworm

LABEL maintainer="NEXUS CORE Team"
LABEL description="NEXUS CORE 2.0 Multi-Agent Orchestrator & Autonomous Evolution Engine"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000 \
    HOST=0.0.0.0

WORKDIR /app

# Install system utilities and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source tree
COPY app/ ./app/
COPY frontend/ ./frontend/
COPY scripts/ ./scripts/
COPY docs/ ./docs/

# Create persistent state directory for SQLite / memory storage
RUN mkdir -p /root/.nexus-core-2.0

EXPOSE 8000

# Health check probe
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Production server entrypoint
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
