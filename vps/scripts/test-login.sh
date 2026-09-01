#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
USERNAME="${1:-yangchuadmin}"
COOKIE_FILE="$(mktemp)"
trap 'rm -f "${COOKIE_FILE}"' EXIT

read -r -s -p "Kitchen OS password for ${USERNAME}: " SECRET
echo

LOGIN_BODY="$(python3 - <<'PY' "${USERNAME}" "${SECRET}"
import json,sys
print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))
PY
)"
unset SECRET

echo "=== LOGIN ==="
HTTP_CODE="$(curl -sS -o /tmp/kitchen-login.json -w '%{http_code}'   -c "${COOKIE_FILE}"   -H 'Content-Type: application/json'   -d "${LOGIN_BODY}"   http://127.0.0.1:8080/api/auth/login)"
cat /tmp/kitchen-login.json
echo
echo "HTTP ${HTTP_CODE}"
[[ "${HTTP_CODE}" == "200" ]] || exit 1

echo
echo "=== SESSION /api/auth/me ==="
curl -fsS -b "${COOKIE_FILE}" http://127.0.0.1:8080/api/auth/me
echo

echo
echo "=== LOGOUT ==="
curl -fsS -b "${COOKIE_FILE}" -c "${COOKIE_FILE}"   -X POST http://127.0.0.1:8080/api/auth/logout
echo

echo "LOGIN_TEST_OK"
