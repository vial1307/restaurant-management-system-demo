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

echo "[1/12] Loading exact tested source..."
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

echo "[2/12] Updating compose definition..."
cp "${REPO_DIR}/vps/docker-compose.yml" "${APP_DIR}/docker-compose.yml"
chown deploy:deploy "${APP_DIR}/docker-compose.yml"
docker network inspect marketing_edge >/dev/null 2>&1 || docker network create marketing_edge >/dev/null

echo "[2b/12] Installing private AgentMemory runtime..."
bash "${REPO_DIR}/vps/scripts/install-agentmemory.sh"

echo "[3/12] Installing filtered host metrics snapshot..."
bash "${REPO_DIR}/vps/scripts/install-host-metrics-timer.sh"

echo "[3b/12] Installing allowlisted Super Admin host-action bridge..."
bash "${REPO_DIR}/vps/scripts/install-admin-action-runner.sh"

echo "[4/12] Frontend JavaScript syntax preflight..."
docker run --rm -v "${REPO_DIR}:/repo:ro" node:22-alpine sh -lc '
  set -e
  for file in /repo/src/*.js /repo/tests/*.mjs; do
    node --check "$file"
  done
  node --check /repo/vps/scripts/agentmemory-sync.mjs
'
bash -n "${REPO_DIR}/vps/scripts/install-agentmemory.sh"
bash -n "${REPO_DIR}/vps/scripts/admin-action-runner.sh"

echo "[5/12] Building API image..."
cd "${APP_DIR}"
APP_RELEASE="$(runuser -u deploy -- git -C "${REPO_DIR}" rev-parse --short HEAD)"
export APP_RELEASE
docker compose --env-file .env build app

echo "[6/12] Preparing validated frontend release..."
rm -rf "${WEB_NEXT}"
mkdir -p "${WEB_NEXT}"
cp -a "${REPO_DIR}/index.html" "${WEB_NEXT}/"
cp -a "${REPO_DIR}/.admindev.html" "${WEB_NEXT}/"
cp -a "${REPO_DIR}/admin.html" "${WEB_NEXT}/"
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

echo "[7/12] Creating pre-deploy database backup..."
bash "${REPO_DIR}/vps/scripts/backup.sh"

echo "[7b/12] Auditing inventory site isolation before migrations..."
bash "${REPO_DIR}/vps/scripts/audit-inventory-site-isolation.sh"

echo "[8/12] Applying database migrations..."
bash "${REPO_DIR}/vps/scripts/migrate.sh"

echo "[9/12] Starting database and API..."
docker compose --env-file .env up -d db app

echo "[10/12] Waiting for API health..."
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

echo "[11/12] Verifying production database integrity..."
if ! bash "${REPO_DIR}/vps/scripts/verify-vps-data.sh"; then
  echo "Database verification failed. Existing frontend remains active."
  docker compose --env-file .env logs --tail=120 app
  exit 1
fi

echo "[12/12] Activating frontend release..."
rm -rf "${WEB_PREV}"
if [[ -d "${WEB_LIVE}" ]]; then
  mv "${WEB_LIVE}" "${WEB_PREV}"
fi
mv "${WEB_NEXT}" "${WEB_LIVE}"

docker compose --env-file .env up -d --force-recreate web

AGENTMEMORY_DEPLOY_SECRET="$(sed -n 's/^AGENTMEMORY_SECRET=//p' "${APP_DIR}/agentmemory.env" | tail -n1)"
if [[ ! "${AGENTMEMORY_DEPLOY_SECRET}" =~ ^[0-9A-Za-z._~-]{16,256}$ ]]; then
  echo "AGENTMEMORY_DEPLOY_SECRET_INVALID"
  exit 1
fi

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null \
    && curl -fsS http://127.0.0.1/ >/dev/null \
    && curl -fsS http://127.0.0.1/.admindev.html >/dev/null \
    && curl -fsS -H "Authorization: Bearer ${AGENTMEMORY_DEPLOY_SECRET}" http://127.0.0.1:3111/agentmemory/livez >/dev/null; then
    echo "Web/API/Super Admin edge healthy."
    echo "Release: ${APP_RELEASE}"
    docker compose --env-file .env ps

    # First-time Marketing bootstrap is queued asynchronously so a private-repo
    # access issue can never roll back an otherwise healthy Kitchen OS release.
    MARKETING_BOOTSTRAP_SENTINEL="${APP_DIR}/admin-actions/.marketing-bootstrap-requested"
    if [[ ! -d /opt/marketing-seo-platform/.git && ! -f "${MARKETING_BOOTSTRAP_SENTINEL}" ]]; then
      REQUEST_ID="$(cat /proc/sys/kernel/random/uuid)"
      REQUEST_TMP="${APP_DIR}/admin-actions/requests/.${REQUEST_ID}.bootstrap.tmp"
      REQUEST_FILE="${APP_DIR}/admin-actions/requests/${REQUEST_ID}.request"
      {
        echo "VERSION=1"
        echo "REQUEST_ID=${REQUEST_ID}"
        echo "ACTION=marketing_deploy"
        echo "CREATED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      } > "${REQUEST_TMP}"
      chmod 0600 "${REQUEST_TMP}"
      mv "${REQUEST_TMP}" "${REQUEST_FILE}"
      touch "${MARKETING_BOOTSTRAP_SENTINEL}"
      systemctl start --no-block kitchen-admin-actions.service || true
      echo "Queued first Marketing deployment request ${REQUEST_ID}."
    fi
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
