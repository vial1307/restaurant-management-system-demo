#!/usr/bin/env bash
# Explicit opt-in; does not modify the restaurant database.
set -euo pipefail
RUNTIME_DIR="${KITCHEN_RUNTIME_DIR:-/opt/kitchen-os}"
cd "$RUNTIME_DIR"
if [[ ! -f docker-compose.yml || ! -f docker-compose.finance.yml || ! -f .env ]]; then
 echo "Missing compose files or VPS .env under $RUNTIME_DIR" >&2; exit 1
fi
umask 077
set -a
source "$RUNTIME_DIR/.env"
set +a
test -n "$FINANCE_BACKUP_KEY" || { echo FINANCE_BACKUP_KEY_MISSING; exit 74; }
SQL="./repo/vps/finance/migrations/001_personal_finance.sql"
if [[ ! -f "$SQL" ]]; then
 echo "Missing finance migration: $SQL" >&2; exit 1
fi
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.finance.yml)
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" up -d finance_db
BACKUP_DIR="$RUNTIME_DIR/backups/finance"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
BACKUP_FILE="$BACKUP_DIR/pre-finance-v001-$STAMP.dump.enc"
"${COMPOSE[@]}" exec -T finance_db pg_dump -U finance_app -d personal_finance -Fc | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:FINANCE_BACKUP_KEY -out "$BACKUP_FILE"
test -s "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
echo "Encrypted pre-migration finance backup and checksum verified."
"${COMPOSE[@]}" exec -T finance_db psql -X -v ON_ERROR_STOP=1 -U finance_app -d personal_finance -f - < "$SQL"
"${COMPOSE[@]}" exec -T finance_db psql -X -v ON_ERROR_STOP=1 -U finance_app -d personal_finance -c \
 "SELECT version, applied_at FROM finance.schema_migrations ORDER BY version"
echo "Schema installed. Restore test, owner-only API, dedicated backups and UI deployment remain pending."
