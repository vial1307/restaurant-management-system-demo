#!/usr/bin/env bash
set -euo pipefail

USERNAME="${1:-yangchuadmin}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
COOKIE_FILE="$(mktemp)"
LOGIN_JSON="$(mktemp)"
INV_JSON="$(mktemp)"
trap 'rm -f "${COOKIE_FILE}" "${LOGIN_JSON}" "${INV_JSON}"' EXIT

read -r -s -p "Kitchen OS password for ${USERNAME}: " SECRET
echo

LOGIN_BODY="$(python3 - "${USERNAME}" "${SECRET}" <<'PY'
import json,sys
print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))
PY
)"
unset SECRET

echo "=== HEALTH ==="
curl -fsS "${BASE_URL}/api/health"
echo

echo "=== LOGIN ==="
HTTP_CODE="$(curl -sS -o "${LOGIN_JSON}" -w '%{http_code}'   -c "${COOKIE_FILE}"   -H 'Content-Type: application/json'   -d "${LOGIN_BODY}"   "${BASE_URL}/api/auth/login")"
cat "${LOGIN_JSON}"
echo
echo "HTTP ${HTTP_CODE}"
[[ "${HTTP_CODE}" == "200" ]] || exit 1

echo "=== SESSION ==="
curl -fsS -b "${COOKIE_FILE}" "${BASE_URL}/api/auth/me"
echo

echo "=== INVENTORY COMPATIBILITY ==="
curl -fsS -b "${COOKIE_FILE}" "${BASE_URL}/api/inventory/schema-version"
echo

echo "=== FUXING INVENTORY READ ==="
curl -fsS -b "${COOKIE_FILE}" "${BASE_URL}/api/inventory/fuxing" > "${INV_JSON}"
python3 - "${INV_JSON}" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as f:
    data=json.load(f)
print("site=",data.get("site"))
print("items=",len(data.get("items",[])))
print("locations=",len(data.get("locations",[])))
print("stock_rows=",len(data.get("stock",[])))
PY

echo "=== LOGOUT ==="
curl -fsS -b "${COOKIE_FILE}" -c "${COOKIE_FILE}"   -X POST "${BASE_URL}/api/auth/logout"
echo

echo "VPS_CUTOVER_READ_TEST_OK"
