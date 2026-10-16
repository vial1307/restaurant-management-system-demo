#!/usr/bin/env bash
# Opt-in activation of an independent PostgreSQL 16 database on the Kitchen VPS.
set -euo pipefail
umask 077
DIR=/opt/kitchen-os
cd "$DIR"
test "$(id -u)" -eq 0 || { echo FINANCE_ACTIVATE_NEEDS_ROOT; exit 77; }
test -f "$DIR/.env" && test -f "$DIR/repo/vps/docker-compose.finance.yml" || { echo FINANCE_MISSING_FILES; exit 67; }
# Refuse optional database provisioning when the shared VPS is under resource pressure.
free_kb="$(df -Pk "$DIR" | awk 'NR==2 {print $4}')"
mem_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
if (( free_kb < 1048576 || mem_kb < 307200 )); then
 echo FINANCE_RESOURCE_PREFLIGHT_FAILED
 exit 75
fi
db_name="$(sed -n 's/^POSTGRES_DB=//p' "$DIR/.env" | tail -n 1)"
db_user="$(sed -n 's/^POSTGRES_USER=//p' "$DIR/.env" | tail -n 1)"
test -n "$db_name" && test -n "$db_user" || { echo KITCHEN_DB_UNCONFIGURED; exit 69; }
owner="$(docker exec kitchen-os-db psql -X -At -U "$db_user" -d "$db_name" -c "select id from public.app_users where username='yangchuadmin' and active=true" 2>/dev/null || true)"
if ! [[ "$owner" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]; then
 echo FINANCE_OWNER_ACCOUNT_NOT_VERIFIED
 exit 70
fi
# Generate confidential environment values on the VPS, never in public CI output.
if ! grep -q '^FINANCE_POSTGRES_PASSWORD=' "$DIR/.env"; then
 printf '\nFINANCE_POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" >> "$DIR/.env"
fi
if ! grep -q '^FINANCE_OWNER_USER_ID=' "$DIR/.env"; then
 printf 'FINANCE_OWNER_USER_ID=%s\n' "$owner" >> "$DIR/.env"
fi
if ! grep -q '^FINANCE_BACKUP_KEY=' "$DIR/.env"; then
 printf 'FINANCE_BACKUP_KEY=%s\n' "$(openssl rand -hex 32)" >> "$DIR/.env"
fi
chmod 600 "$DIR/.env"
cp "$DIR/repo/vps/docker-compose.finance.yml" "$DIR/docker-compose.finance.yml"
chmod 640 "$DIR/docker-compose.finance.yml"
docker compose --env-file "$DIR/.env" -f docker-compose.yml -f docker-compose.finance.yml config --quiet
docker compose --env-file "$DIR/.env" -f docker-compose.yml -f docker-compose.finance.yml up -d finance_db
for attempt in $(seq 1 45); do
 if docker exec kitchen-finance-db pg_isready -U finance_app -d personal_finance >/dev/null 2>&1; then break; fi
 if [[ "$attempt" -eq 45 ]]; then echo FINANCE_DB_START_FAILED; exit 71; fi
 sleep 2
done
KITCHEN_RUNTIME_DIR="$DIR" bash "$DIR/repo/vps/finance/migrate.sh"
docker compose --env-file "$DIR/.env" -f docker-compose.yml -f docker-compose.finance.yml up -d --no-deps app
for attempt in $(seq 1 45); do
 if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then break; fi
 if [[ "$attempt" -eq 45 ]]; then
  echo FINANCE_ACTIVATE_API_UNHEALTHY
  docker compose --env-file "$DIR/.env" -f docker-compose.yml up -d --no-deps app || true
  exit 72
 fi
 sleep 2
done
docker exec kitchen-finance-db psql -X -At -v ON_ERROR_STOP=1 -U finance_app -d personal_finance -c "select count(*) from finance.currencies" | grep -qx 6
bash "$DIR/repo/vps/finance/backup-encrypted.sh"
install -o root -g root -m 0755 "$DIR/repo/vps/finance/backup-encrypted.sh" /usr/local/sbin/kitchen-finance-backup
cat > /etc/cron.d/kitchen-finance-backup <<'EOF'
11 4 * * * root /usr/local/sbin/kitchen-finance-backup >> /var/log/kitchen-finance-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/kitchen-finance-backup
echo FINANCE_DB_AND_APP_ACTIVATED
