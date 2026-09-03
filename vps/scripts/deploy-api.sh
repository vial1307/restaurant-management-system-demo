#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
REPO_DIR="${APP_DIR}/repo"
WEB_LIVE="${APP_DIR}/www"
WEB_NEXT="${APP_DIR}/www.next"
WEB_PREV="${APP_DIR}/www.prev"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

echo "[1/11] Updating source..."
runuser -u deploy -- git -C "${REPO_DIR}" pull --ff-only origin main

echo "[2/11] Updating compose definition..."
cp "${REPO_DIR}/vps/docker-compose.yml" "${APP_DIR}/docker-compose.yml"
chown deploy:deploy "${APP_DIR}/docker-compose.yml"

echo "[3/11] Frontend JavaScript syntax preflight..."
docker run --rm -v "${REPO_DIR}:/repo:ro" node:22-alpine sh -lc '
  set -e
  for file in /repo/src/*.js /repo/tests/*.mjs; do
    node --check "$file"
  done
'

echo "[4/11] Building API image..."
cd "${APP_DIR}"
APP_RELEASE="$(runuser -u deploy -- git -C "${REPO_DIR}" rev-parse --short HEAD)"
export APP_RELEASE
docker compose --env-file .env build app

echo "[5/11] Preparing validated frontend release..."
rm -rf "${WEB_NEXT}"
mkdir -p "${WEB_NEXT}"
cp -a "${REPO_DIR}/index.html" "${WEB_NEXT}/"
cp -a "${REPO_DIR}/vps-entry.html" "${WEB_NEXT}/"
cp -a "${REPO_DIR}/manifest.webmanifest" "${WEB_NEXT}/"
cp -a "${REPO_DIR}/sw.js" "${WEB_NEXT}/"
cp -a "${REPO_DIR}/src" "${WEB_NEXT}/"
printf '%s\n' "${APP_RELEASE}" > "${WEB_NEXT}/RELEASE"
chown -R deploy:deploy "${WEB_NEXT}"

echo "[6/11] Creating pre-deploy database backup..."
bash "${REPO_DIR}/vps/scripts/backup.sh"

echo "[7/11] Applying database migrations..."
bash "${REPO_DIR}/vps/scripts/migrate.sh"

echo "[8/11] Starting database and API..."
docker compose --env-file .env up -d db app

echo "[9/11] Waiting for API health..."
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null; then
    echo "API healthy."
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    echo "API health check failed. Existing frontend remains active."
    docker compose --env-file .env logs --tail=120 app
    exit 1
  fi
  sleep 2
done

echo "[10/11] Verifying production database integrity..."
if ! bash "${REPO_DIR}/vps/scripts/verify-vps-data.sh"; then
  echo "Database verification failed. Existing frontend remains active."
  docker compose --env-file .env logs --tail=120 app
  exit 1
fi

echo "[11/11] Activating frontend release..."
rm -rf "${WEB_PREV}"
if [[ -d "${WEB_LIVE}" ]]; then
  mv "${WEB_LIVE}" "${WEB_PREV}"
fi
mv "${WEB_NEXT}" "${WEB_LIVE}"

docker compose --env-file .env up -d --force-recreate web

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null \
    && curl -fsS http://127.0.0.1/ >/dev/null; then
    echo "Web/API edge healthy."
    echo "Release: ${APP_RELEASE}"
    docker compose --env-file .env ps
    exit 0
  fi
  sleep 2
done

echo "Web edge health check failed. Rolling frontend back..."
rm -rf "${WEB_LIVE}"
if [[ -d "${WEB_PREV}" ]]; then
  mv "${WEB_PREV}" "${WEB_LIVE}"
  docker compose --env-file .env up -d --force-recreate web
fi

docker compose --env-file .env ps
docker compose --env-file .env logs --tail=120 web
exit 1
