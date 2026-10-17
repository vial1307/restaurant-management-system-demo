#!/usr/bin/env bash
# Installed root-owned from the exact deployment commit. Never reads .env via
# the deploy SSH user, and never accepts arbitrary SQL/shell commands.
set -euo pipefail
umask 077
[[ "$(id -u)" -eq 0 ]] || { echo VERIFY_REQUIRES_ROOT >&2; exit 77; }
[[ $# -ge 1 && $# -le 2 ]] || { echo VERIFY_USAGE >&2; exit 64; }
task="$1"
site="${2:-all}"
case "$site" in all|fuxing|yongji|central) ;; *) echo VERIFY_INVALID_SITE >&2; exit 64;; esac
case "$task" in
 inventory-1|inventory-2|inventory-3|inventory-4|inventory-5)
   [[ $# -eq 1 ]] || { echo VERIFY_INVENTORY_ARGS >&2; exit 64; }
   sql="/usr/local/share/kitchen-os-inventory-audit/${task}.sql"
   [[ -f "$sql" ]] || { echo VERIFY_SQL_MISSING >&2; exit 66; }
   docker exec -i kitchen-os-db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$sql"
 ;;
 workforce-staff|workforce-schedule|workforce-attendance|workforce-parity|workforce-staff-apply|workforce-schedule-apply|workforce-attendance-apply)
   args=()
   if [[ "$site" != "all" ]]; then args+=("--site=$site"); fi
   case "$task" in
     workforce-staff|workforce-staff-apply) file="workforce-staff-backfill.mjs" ;;
     workforce-schedule|workforce-schedule-apply) file="workforce-schedule-backfill.mjs" ;;
     workforce-attendance|workforce-attendance-apply) file="workforce-attendance-backfill.mjs" ;;
     workforce-parity) file="workforce-schedule-backfill.mjs"; args+=("--parity") ;;
   esac
   if [[ "$task" == *-apply ]]; then
     # Explicit workflow_dispatch only: caller must select apply. Always make
     # a pre-write backup while root can securely read the environment file.
     bash /opt/kitchen-os/repo/vps/scripts/backup.sh
     args+=("--apply")
   fi
   docker exec kitchen-os-api node "scripts/$file" "${args[@]}"
 ;;
 *) echo VERIFY_TASK_NOT_ALLOWED >&2; exit 64 ;;
esac
