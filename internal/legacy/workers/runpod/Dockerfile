# Lucid RunPod Serverless Worker
# Fluid Compute v0.2
#
# Build:
#   docker build -t lucid/worker-runpod:latest .
#
# Build with runtime hash:
#   docker build --build-arg RUNTIME_HASH=$(docker inspect --format='{{.Id}}' lucid/worker-runpod:latest) -t lucid/worker-runpod:v0.2.0 .

# Base image with PyTorch, CUDA, and common ML dependencies
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker code
COPY worker_handler.py .

# Build arguments
ARG RUNTIME_HASH=""
ARG MODEL_ID="meta-llama/Llama-2-7b-chat-hf"

# Set environment variables
ENV RUNTIME_HASH=${RUNTIME_HASH}
ENV MODEL_ID=${MODEL_ID}
ENV PYTHONUNBUFFERED=1

# Health check (optional - RunPod handles this)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#     CMD python -c "import runpod; print('healthy')" || exit 1

# Entry point
CMD ["python", "-u", "worker_handler.py"]
