#!/usr/bin/env bash
set -euo pipefail

echo "=== HTTP FRONTEND ==="
curl -fsSI http://127.0.0.1/ | sed -n '1,8p'

echo
echo "=== HTTP API ==="
curl -fsS http://127.0.0.1/api/health
echo

echo
echo "WEB_SMOKE_TEST_OK"
