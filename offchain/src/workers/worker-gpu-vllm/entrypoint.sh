#!/usr/bin/env bash
set -euo pipefail

: "${VLLM_MODEL_ID:?VLLM_MODEL_ID is required (pinned revision)}"
: "${VLLM_PORT:=8000}"
: "${WORKER_PORT:=8080}"

mkdir -p "${VLLM_MODEL_DIR:-/models}"

echo "[entrypoint] starting vLLM on :${VLLM_PORT} for ${VLLM_MODEL_ID}"
python3 -m vllm.entrypoints.openai.api_server \
  --host 0.0.0.0 \
  --port "${VLLM_PORT}" \
  --model "${VLLM_MODEL_ID}" \
  --download-dir "${VLLM_MODEL_DIR:-/models}" \
  --tensor-parallel-size "${VLLM_TENSOR_PARALLEL_SIZE:-1}" \
  ${VLLM_EXTRA_ARGS:-} \
  > /var/log/vllm.log 2>&1 &

echo "[entrypoint] waiting for vLLM..."
for i in {1..60}; do
  if curl -sf "http://127.0.0.1:${VLLM_PORT}/health" >/dev/null; then
    echo "[entrypoint] vLLM healthy"
    break
  fi
  sleep 2
done

echo "[entrypoint] starting worker on :${WORKER_PORT}"
exec node dist/workers/worker-gpu-vllm/index.js