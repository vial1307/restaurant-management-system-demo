#!/usr/bin/env bash
set -euo pipefail

# KITCHEN_EXACT_TARGET_V1
# GitHub Actions must provide the exact tested commit through TARGET_FILE.
# This prevents an older queued workflow from testing commit A and then
# accidentally deploying a newer untested commit B by pulling main at runtime.

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
REPO_DIR="${APP_DIR}/repo"
WEB_LIVE="${APP_DIR}/www"
WEB_NEXT="${APP_DIR}/www.next"
WEB_PREV="${APP_DIR}/www.prev"
TARGET_FILE="/home/deploy/.kitchen-os-deploy-target"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

echo "[1/11] Loading exact tested source..."
SOURCE_BEFORE="$(runuser -u deploy -- git -C "${REPO_DIR}" rev-parse HEAD 2>/dev/null || true)"
DEPLOY_TARGET="${KITCHEN_DEPLOY_TARGET:-}"
if [[ -z "${DEPLOY_TARGET}" && -f "${TARGET_FILE}" ]]; then
  DEPLOY_TARGET="$(tr -d '[:space:]' < "${TARGET_FILE}")"
fi
rm -f "${TARGET_FILE}"

if [[ ! "${DEPLOY_TARGET}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "DEPLOY_TARGET_REQUIRED: refusing to deploy an unpinned main branch."
  exit 64
fi
export KITCHEN_DEPLOY_TARGET="${DEPLOY_TARGET}"

runuser -u deploy -- git -C "${REPO_DIR}" fetch --prune origin main
if ! runuser -u deploy -- git -C "${REPO_DIR}" cat-file -e "${DEPLOY_TARGET}^{commit}" 2>/dev/null; then
  echo "DEPLOY_TARGET_NOT_FOUND: ${DEPLOY_TARGET}"
  exit 65
fi
if ! runuser -u deploy -- git -C "${REPO_DIR}" merge-base --is-ancestor "${DEPLOY_TARGET}" origin/main; then
  echo "DEPLOY_TARGET_NOT_ON_MAIN: ${DEPLOY_TARGET}"
  exit 66
fi
if ! runuser -u deploy -- git -C "${REPO_DIR}" show "${DEPLOY_TARGET}:vps/scripts/deploy-api.sh" 2>/dev/null | grep -q "KITCHEN_EXACT_TARGET_V1"; then
  echo "DEPLOY_TARGET_TOO_OLD: exact-target deployment contract missing."
  exit 67
fi

runuser -u deploy -- git -C "${REPO_DIR}" reset --hard "${DEPLOY_TARGET}"
SOURCE_AFTER="$(runuser -u deploy -- git -C "${REPO_DIR}" rev-parse HEAD)"
if [[ "${SOURCE_AFTER}" != "${DEPLOY_TARGET}" ]]; then
  echo "DEPLOY_TARGET_MISMATCH: expected ${DEPLOY_TARGET}, got ${SOURCE_AFTER}"
  exit 68
fi

# Bash may continue executing the copy of this script that was loaded before
# the repository was reset to the tested commit. Re-exec exactly once so the
# deployment logic stored in that same tested commit performs activation.
if [[ "${KITCHEN_DEPLOY_REEXEC:-0}" != "1" && "${SOURCE_BEFORE}" != "${SOURCE_AFTER}" ]]; then
  echo "Source changed ${SOURCE_BEFORE:0:7} -> ${SOURCE_AFTER:0:7}; reloading tested deploy script..."
  export KITCHEN_DEPLOY_REEXEC=1
  exec /usr/bin/bash "${REPO_DIR}/vps/scripts/deploy-api.sh"
fi

echo "Deploy target verified: ${DEPLOY_TARGET}"

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
# Node.js is intentionally not installed on the VPS host. Run release stamping
# in the same pinned Node container family used by CI/preflight so deployment
# has no hidden host-runtime dependency.
docker run --rm \
  -v "${REPO_DIR}:/repo:ro" \
  -v "${WEB_NEXT}:/release" \
  node:22-alpine \
  node /repo/vps/scripts/stamp-frontend-release.mjs /release "${APP_RELEASE}"
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
