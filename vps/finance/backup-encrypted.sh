#!/usr/bin/env bash
# Encrypt pg_dump on disk, verify SHA-256, test restore to an isolated temp database.
set -euo pipefail
umask 077
DIR=/opt/kitchen-os
test "$(id -u)" -eq 0 || { echo FINANCE_BACKUP_ROOT_REQUIRED; exit 77; }
cd "$DIR"
set -a
source "$DIR/.env"
set +a
test -n "$FINANCE_BACKUP_KEY" || { echo FINANCE_BACKUP_KEY_MISSING; exit 70; }
dest="$DIR/backups/finance"
install -d -m 0700 "$dest"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dest/finance_$stamp.dump.enc"
docker exec kitchen-finance-db pg_dump -U finance_app -d personal_finance -Fc |
 openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:FINANCE_BACKUP_KEY -out "$file"
test -s "$file"
sha256sum "$file" > "$file.sha256"
# Separate temporary database, never touch kitchen_os or the live finance database.
docker exec kitchen-finance-db dropdb --if-exists -U finance_app finance_restore_rehearsal >/dev/null 2>&1 || true
docker exec kitchen-finance-db createdb -U finance_app -T template0 finance_restore_rehearsal
trap 'docker exec kitchen-finance-db dropdb --if-exists -U finance_app finance_restore_rehearsal >/dev/null 2>&1 || true' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:FINANCE_BACKUP_KEY -in "$file" |
 docker exec -i kitchen-finance-db pg_restore -U finance_app --no-owner --no-acl -d finance_restore_rehearsal
docker exec kitchen-finance-db psql -X -At -v ON_ERROR_STOP=1 -U finance_app -d finance_restore_rehearsal -c "select count(*) from finance.currencies" | grep -qx 6
(cd "$dest" && sha256sum -c "$(basename "$file.sha256")" >/dev/null)
find "$dest" -type f -name 'finance_*.dump.enc' -mtime +14 -delete
find "$dest" -type f -name 'finance_*.dump.enc.sha256' -mtime +14 -delete
echo FINANCE_ENCRYPTED_BACKUP_AND_RESTORE_PASS
