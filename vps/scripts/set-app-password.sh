#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
USERNAME="${1:-}"

[[ -n "${USERNAME}" ]] || { echo "Usage: $0 <username>"; exit 2; }
cd "${APP_DIR}"

read -r -s -p "New Kitchen OS password for ${USERNAME}: " SECRET
echo
read -r -s -p "Confirm password: " CONFIRM
echo

[[ "${SECRET}" == "${CONFIRM}" ]] || { echo "Passwords do not match."; exit 2; }
[[ "${#SECRET}" -ge 10 ]] || { echo "Password must be at least 10 characters."; exit 2; }

printf '%s' "${SECRET}" | docker compose --env-file .env run --rm -T app   node scripts/set-password.mjs "${USERNAME}"

unset SECRET CONFIRM
