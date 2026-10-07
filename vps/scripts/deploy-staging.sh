#!/usr/bin/env bash
set -euo pipefail

STAGE_DIR="/opt/kitchen-os-staging"
PROD_DIR="/opt/kitchen-os"
TARGET_FILE="/home/deploy/.kitchen-os-staging-target"
BUNDLE_FILE="/home/deploy/.kitchen-os-staging-bundle.tgz"
REPO_NEXT="${STAGE_DIR}/repo.next"
REPO_LIVE="${STAGE_DIR}/repo"
REPO_PREV="${STAGE_DIR}/repo.prev"
WEB_NEXT="${STAGE_DIR}/www.next"
WEB_LIVE="${STAGE_DIR}/www"
WEB_PREV="${STAGE_DIR}/www.prev"
DUMP_FILE="${STAGE_DIR}/production-clone.dump"

fail() {
  echo "STAGING_FAILURE:$1" >&2
  exit "${2:-1}"
}

[[ "${EUID}" -eq 0 ]] || fail "ROOT_REQUIRED" 77
[[ -f "${TARGET_FILE}" ]] || fail "TARGET_FILE_MISSING" 64
[[ -s "${BUNDLE_FILE}" ]] || fail "BUNDLE_MISSING" 65
[[ -f "${PROD_DIR}/.env" ]] || fail "PRODUCTION_ENV_MISSING" 66

TARGET="$(tr -d '[:space:]' < "${TARGET_FILE}")"
[[ "${TARGET}" =~ ^[0-9a-f]{40}$ ]] || fail "INVALID_TARGET" 67

mkdir -p "${STAGE_DIR}" "${STAGE_DIR}/runtime" "${STAGE_DIR}/admin-actions"
docker network inspect kitchen_staging_edge >/dev/null 2>&1 || docker network create kitchen_staging_edge >/dev/null

rm -rf "${REPO_NEXT}"
mkdir -p "${REPO_NEXT}"
tar -xzf "${BUNDLE_FILE}" -C "${REPO_NEXT}"
[[ -f "${REPO_NEXT}/.staging-source-sha" ]] || fail "SOURCE_STAMP_MISSING" 68
ACTUAL="$(tr -d '[:space:]' < "${REPO_NEXT}/.staging-source-sha")"
[[ "${ACTUAL}" == "${TARGET}" ]] || fail "SOURCE_SHA_MISMATCH expected=${TARGET} actual=${ACTUAL}" 69
[[ -f "${REPO_NEXT}/vps/docker-compose.staging.yml" ]] || fail "STAGING_COMPOSE_MISSING" 70
[[ -f "${REPO_NEXT}/vps/Caddyfile.staging" ]] || fail "STAGING_CADDY_MISSING" 71
[[ -f "${REPO_NEXT}/vps/scripts/schema-fingerprint.sh" ]] || fail "FINGERPRINT_SCRIPT_MISSING" 72

if [[ ! -f "${STAGE_DIR}/.env" ]]; then
  umask 077
  STAGING_PASSWORD="$(openssl rand -hex 32)"
  cat > "${STAGE_DIR}/.env" <<EOF
POSTGRES_DB=kitchen_os_staging
POSTGRES_USER=kitchen_staging
POSTGRES_PASSWORD=${STAGING_PASSWORD}
BACKUP_KEEP_DAYS=2
WORKFORCE_SCHEDULE_RELATIONAL_READ=true
EOF
fi

cp "${REPO_NEXT}/vps/docker-compose.staging.yml" "${STAGE_DIR}/docker-compose.yml"

set -a
source "${STAGE_DIR}/.env"
set +a
STAGE_DB="${POSTGRES_DB}"
STAGE_USER="${POSTGRES_USER}"

PROD_DB="$(sed -n 's/^POSTGRES_DB=//p' "${PROD_DIR}/.env" | tail -n1)"
PROD_USER="$(sed -n 's/^POSTGRES_USER=//p' "${PROD_DIR}/.env" | tail -n1)"
[[ -n "${PROD_DB}" && -n "${PROD_USER}" ]] || fail "PRODUCTION_DB_IDENTITY_MISSING" 73

echo "[staging 1/10] Capturing production schema fingerprint..."
PROD_BEFORE="$(bash "${REPO_NEXT}/vps/scripts/schema-fingerprint.sh" kitchen-os-db "${PROD_USER}" "${PROD_DB}")"
[[ "${PROD_BEFORE}" == *"|"* ]] || fail "PRODUCTION_FINGERPRINT_INVALID" 74
echo "Production source: ${PROD_BEFORE}"

echo "[staging 2/10] Dumping production database read-only..."
TMP_DUMP="${DUMP_FILE}.tmp"
rm -f "${TMP_DUMP}"
docker exec kitchen-os-db pg_dump -U "${PROD_USER}" -d "${PROD_DB}" -Fc --no-owner --no-acl > "${TMP_DUMP}"
[[ -s "${TMP_DUMP}" ]] || fail "PRODUCTION_DUMP_EMPTY" 75
mv "${TMP_DUMP}" "${DUMP_FILE}"

echo "[staging 3/10] Preparing isolated staging PostgreSQL..."
cd "${STAGE_DIR}"
APP_RELEASE="${TARGET:0:7}-staging" docker compose --env-file .env stop app web >/dev/null 2>&1 || true
APP_RELEASE="${TARGET:0:7}-staging" docker compose --env-file .env up -d db
for attempt in $(seq 1 30); do
  if docker exec kitchen-os-staging-db pg_isready -U "${STAGE_USER}" -d "${STAGE_DB}" >/dev/null 2>&1; then break; fi
  [[ "${attempt}" == "30" ]] && fail "STAGING_DB_NOT_READY" 76
  sleep 1
done

docker exec kitchen-os-staging-db dropdb --if-exists --force -U "${STAGE_USER}" "${STAGE_DB}" >/dev/null 2>&1 || true
docker exec kitchen-os-staging-db createdb -U "${STAGE_USER}" "${STAGE_DB}"
docker exec -i kitchen-os-staging-db pg_restore -U "${STAGE_USER}" -d "${STAGE_DB}" --no-owner --no-acl < "${DUMP_FILE}"

echo "[staging 4/10] Verifying clone parity before candidate migrations..."
STAGE_CLONE="$(bash "${REPO_NEXT}/vps/scripts/schema-fingerprint.sh" kitchen-os-staging-db "${STAGE_USER}" "${STAGE_DB}")"
echo "Staging clone: ${STAGE_CLONE}"
[[ "${STAGE_CLONE}" == "${PROD_BEFORE}" ]] || fail "STAGING_CLONE_DRIFT production=${PROD_BEFORE} staging=${STAGE_CLONE}" 80

# Sessions are runtime credentials, not staging test data. Remove them only
# after schema parity has been proven so the clone fingerprint remains exact.
docker exec kitchen-os-staging-db psql -v ON_ERROR_STOP=1 -U "${STAGE_USER}" -d "${STAGE_DB}"   -c "truncate table public.sessions;" >/dev/null 2>&1 || true

echo "[staging 5/10] Activating exact candidate source..."
rm -rf "${REPO_PREV}"
if [[ -d "${REPO_LIVE}" ]]; then mv "${REPO_LIVE}" "${REPO_PREV}"; fi
mv "${REPO_NEXT}" "${REPO_LIVE}"

echo "[staging 6/10] Applying candidate migrations to staging only..."
# Trusted deployer executes SQL inside the isolated staging DB; production is
# never a migration target in this script.
MIGRATIONS_DIR="${REPO_LIVE}/vps/database/migrations"
docker exec kitchen-os-staging-db psql -v ON_ERROR_STOP=1 -U "${STAGE_USER}" -d "${STAGE_DB}" <<'SQL'
create table if not exists public.schema_migrations (
  version text primary key,
  filename text not null,
  applied_at timestamptz not null default now()
);
SQL
for file in "${MIGRATIONS_DIR}"/*.sql; do
  [[ -e "${file}" ]] || continue
  base="$(basename "${file}")"
  version="${base%%_*}"
  applied="$(docker exec kitchen-os-staging-db psql -Atqc "select 1 from public.schema_migrations where version='${version}' limit 1" -U "${STAGE_USER}" -d "${STAGE_DB}")"
  [[ "${applied}" == "1" ]] && continue
  echo "apply ${base}"
  docker exec -i kitchen-os-staging-db psql -v ON_ERROR_STOP=1 -U "${STAGE_USER}" -d "${STAGE_DB}" < "${file}"
  docker exec kitchen-os-staging-db psql -v ON_ERROR_STOP=1 -U "${STAGE_USER}" -d "${STAGE_DB}"     -c "insert into public.schema_migrations(version,filename) values ('${version}','${base}')" >/dev/null
done

STAGE_CANDIDATE="$(bash "${REPO_LIVE}/vps/scripts/schema-fingerprint.sh" kitchen-os-staging-db "${STAGE_USER}" "${STAGE_DB}")"
echo "Staging candidate: ${STAGE_CANDIDATE}"

echo "[staging 7/10] Ensuring production schema did not move during staging build..."
PROD_AFTER="$(bash "${REPO_LIVE}/vps/scripts/schema-fingerprint.sh" kitchen-os-db "${PROD_USER}" "${PROD_DB}")"
[[ "${PROD_AFTER}" == "${PROD_BEFORE}" ]] || fail "PRODUCTION_SCHEMA_CHANGED_DURING_STAGING before=${PROD_BEFORE} after=${PROD_AFTER}" 81

echo "[staging 8/10] Building candidate API and frontend..."
APP_RELEASE="${TARGET:0:7}-staging" docker compose --env-file .env build app
rm -rf "${WEB_NEXT}"
mkdir -p "${WEB_NEXT}"
for entry in index.html .admindev.html admin.html vps-entry.html manifest.webmanifest sw.js src; do
  [[ -e "${REPO_LIVE}/${entry}" ]] && cp -a "${REPO_LIVE}/${entry}" "${WEB_NEXT}/"
done
printf '%s\n' "${TARGET:0:7}-staging" > "${WEB_NEXT}/RELEASE"
cat > "${WEB_NEXT}/STAGING_RELEASE.json" <<EOF
{
  "environment": "staging",
  "candidate_sha": "${TARGET}",
  "source_production_schema": "${PROD_BEFORE}",
  "candidate_schema": "${STAGE_CANDIDATE}",
  "generated_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
rm -rf "${WEB_PREV}"
if [[ -d "${WEB_LIVE}" ]]; then mv "${WEB_LIVE}" "${WEB_PREV}"; fi
mv "${WEB_NEXT}" "${WEB_LIVE}"

echo "[staging 9/10] Starting isolated staging application..."
APP_RELEASE="${TARGET:0:7}-staging" docker compose --env-file .env up -d app web
for attempt in $(seq 1 40); do
  if docker exec kitchen-os-staging-web wget -q -O - http://127.0.0.1/api/health >/tmp/kitchen-staging-health.json 2>/dev/null; then
    break
  fi
  if [[ "${attempt}" == "40" ]]; then
    docker compose --env-file .env logs --tail=120 app web
    fail "STAGING_HEALTH_FAILED" 82
  fi
  sleep 1
done

echo "[staging 10/10] Running staging data-integrity verification..."
if ! APP_DIR="${STAGE_DIR}" bash "${REPO_LIVE}/vps/scripts/verify-vps-data.sh"; then
  fail "STAGING_DATA_INTEGRITY_FAILED" 83
fi

rm -f "${TARGET_FILE}" "${BUNDLE_FILE}" "${DUMP_FILE}"
echo "STAGING_READY sha=${TARGET} production_schema=${PROD_BEFORE} candidate_schema=${STAGE_CANDIDATE}"
