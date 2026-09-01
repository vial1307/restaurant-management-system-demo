#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
REPO_DIR="${APP_DIR}/repo"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

echo "[1/8] Updating source..."
runuser -u deploy -- git -C "${REPO_DIR}" pull --ff-only origin main

echo "[2/8] Updating compose definition..."
cp "${REPO_DIR}/vps/docker-compose.yml" "${APP_DIR}/docker-compose.yml"
chown deploy:deploy "${APP_DIR}/docker-compose.yml"

echo "[3/8] Creating pre-deploy database backup..."
bash "${REPO_DIR}/vps/scripts/backup.sh"

echo "[4/8] Applying database migrations..."
bash "${REPO_DIR}/vps/scripts/migrate.sh"

echo "[5/8] Building API image..."
cd "${APP_DIR}"
APP_RELEASE="$(runuser -u deploy -- git -C "${REPO_DIR}" rev-parse --short HEAD)"
export APP_RELEASE
docker compose --env-file .env build app

echo "[6/8] Starting database and API..."
docker compose --env-file .env up -d db app

echo "[7/8] Waiting for API health..."
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null; then
    echo "API healthy."
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    echo "API health check failed."
    docker compose --env-file .env logs --tail=120 app
    exit 1
  fi
  sleep 2
done

echo "[8/8] Starting Caddy web edge..."
docker compose --env-file .env up -d web

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health; then
    echo
    echo "Web/API edge healthy."
    docker compose --env-file .env ps
    exit 0
  fi
  sleep 2
done

echo "Web edge health check failed."
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=120 web
exit 1
