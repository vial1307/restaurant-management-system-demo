#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
COMPOSE_FILE="${APP_DIR}/docker-compose.yml"
AGENTMEMORY_ENV="${APP_DIR}/agentmemory.env"
AGENTMEMORY_DATA="${APP_DIR}/agentmemory-data"
AGENTMEMORY_HOME="${APP_DIR}/agentmemory-home"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "AGENTMEMORY_COMPOSE_MISSING: ${COMPOSE_FILE}"
  exit 70
fi

install -d -m 0750 -o 1000 -g 1000 "${AGENTMEMORY_DATA}" "${AGENTMEMORY_HOME}"

if [[ ! -s "${AGENTMEMORY_ENV}" ]]; then
  secret="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  if [[ ! "${secret}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "AGENTMEMORY_SECRET_GENERATION_FAILED"
    exit 71
  fi
  umask 077
  printf 'AGENTMEMORY_SECRET=%s\n' "${secret}" > "${AGENTMEMORY_ENV}"
  chown root:root "${AGENTMEMORY_ENV}"
  chmod 0600 "${AGENTMEMORY_ENV}"
fi

cd "${APP_DIR}"
echo "Building pinned AgentMemory image..."
docker compose --env-file .env build agentmemory

echo "Starting AgentMemory on VPS loopback..."
docker compose --env-file .env up -d agentmemory

for attempt in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:3111/agentmemory/livez >/dev/null; then
    break
  fi
  if [[ "${attempt}" == "60" ]]; then
    echo "AGENTMEMORY_HEALTH_TIMEOUT"
    docker compose --env-file .env logs --tail=160 agentmemory || true
    exit 72
  fi
  sleep 2
done

if command -v ss >/dev/null 2>&1; then
  if ss -ltnH '( sport = :3111 )' 2>/dev/null | grep -Eq '(^|[[:space:]])0\.0\.0\.0:3111|(^|[[:space:]])\*:3111|\[::\]:3111'; then
    echo "AGENTMEMORY_PUBLIC_BIND_REFUSED: REST port 3111 must stay loopback-only"
    docker compose --env-file .env stop agentmemory || true
    exit 73
  fi
fi

health="$(curl -fsS --max-time 5 http://127.0.0.1:3111/agentmemory/health)"
printf 'AgentMemory health: %s\n' "${health}"

if docker exec kitchen-agentmemory node /workspace/vps/scripts/agentmemory-sync.mjs; then
  echo "AgentMemory handoff seed is current."
else
  echo "AGENTMEMORY_HANDOFF_SYNC_FAILED"
  exit 74
fi
