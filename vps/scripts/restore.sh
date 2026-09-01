#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
ENV_FILE="${APP_DIR}/.env"
DUMP="${1:-}"

[[ -n "${DUMP}" && -f "${DUMP}" ]] || { echo "Usage: $0 /path/to/backup.dump"; exit 1; }
[[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE}"; exit 1; }

set -a
source "${ENV_FILE}"
set +a

echo "Restore source: ${DUMP}"
read -r -p "Type RESTORE to continue: " CONFIRM
[[ "${CONFIRM}" == "RESTORE" ]] || exit 1

cd "${APP_DIR}"

docker compose --env-file .env exec -T db   psql -U "${POSTGRES_USER}" -d postgres   -v ON_ERROR_STOP=1   -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${POSTGRES_DB}' and pid <> pg_backend_pid();" >/dev/null

docker compose --env-file .env exec -T db   dropdb -U "${POSTGRES_USER}" --if-exists "${POSTGRES_DB}"
docker compose --env-file .env exec -T db   createdb -U "${POSTGRES_USER}" "${POSTGRES_DB}"

cat "${DUMP}" | docker compose --env-file .env exec -T db   pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges --exit-on-error

echo "Restore completed."
