#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
REPO_DIR="${APP_DIR}/repo"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

echo "[1/7] Updating source..."
runuser -u deploy -- git -C "${REPO_DIR}" pull --ff-only origin main

echo "[2/7] Updating compose definition..."
cp "${REPO_DIR}/vps/docker-compose.yml" "${APP_DIR}/docker-compose.yml"
chown deploy:deploy "${APP_DIR}/docker-compose.yml"

echo "[3/7] Creating pre-deploy database backup..."
bash "${REPO_DIR}/vps/scripts/backup.sh"

echo "[4/7] Applying database migrations..."
bash "${REPO_DIR}/vps/scripts/migrate.sh"

echo "[5/7] Building API image..."
cd "${APP_DIR}"
APP_RELEASE="$(runuser -u deploy -- git -C "${REPO_DIR}" rev-parse --short HEAD)"
export APP_RELEASE
docker compose --env-file .env build app

echo "[6/7] Starting services..."
docker compose --env-file .env up -d db app

echo "[7/7] Waiting for API health..."
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health; then
    echo
    echo "API healthy."
    docker compose --env-file .env ps
    exit 0
  fi
  sleep 2
done

echo "API health check failed."
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=120 app
exit 1
