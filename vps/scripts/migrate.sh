#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
ENV_FILE="${APP_DIR}/.env"
MIGRATIONS_DIR="${APP_DIR}/repo/vps/database/migrations"

[[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE}"; exit 1; }
[[ -d "${MIGRATIONS_DIR}" ]] || { echo "Missing migrations directory"; exit 1; }

set -a
source "${ENV_FILE}"
set +a

cd "${APP_DIR}"

psql_cmd() {
  docker compose --env-file .env exec -T db     psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

psql_cmd <<'SQL'
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

  applied="$(psql_cmd -Atqc "select 1 from public.schema_migrations where version='${version}' limit 1")"
  if [[ "${applied}" == "1" ]]; then
    echo "skip ${base}"
    continue
  fi

  echo "apply ${base}"
  cat "${file}" | psql_cmd
  psql_cmd -c "insert into public.schema_migrations(version,filename) values ('${version}','${base}')"
done

echo "Migrations complete."
psql_cmd -c "select version, filename, applied_at from public.schema_migrations order by version;"
