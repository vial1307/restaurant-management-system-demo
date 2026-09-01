#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
ENV_FILE="${APP_DIR}/.env"
BACKUP_DIR="${APP_DIR}/backups"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/kitchen_os_${STAMP}.dump"
TMP="${OUT}.tmp"

cd "${APP_DIR}"
docker compose --env-file .env exec -T db   pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${TMP}"

if [[ ! -s "${TMP}" ]]; then
  rm -f "${TMP}"
  echo "Backup failed: empty dump."
  exit 1
fi

mv "${TMP}" "${OUT}"
sha256sum "${OUT}" > "${OUT}.sha256"

KEEP="${BACKUP_KEEP_DAYS:-7}"
find "${BACKUP_DIR}" -type f -name 'kitchen_os_*.dump' -mtime "+${KEEP}" -delete
find "${BACKUP_DIR}" -type f -name 'kitchen_os_*.sha256' -mtime "+${KEEP}" -delete

echo "Backup created: ${OUT}"
