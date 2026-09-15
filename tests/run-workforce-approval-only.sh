#!/usr/bin/env bash
set -euo pipefail

tmp="tests/.workforce-approval-browser-regression-only.mjs"
trap 'rm -f "$tmp"' EXIT

# Keep the original approval assertions byte-for-byte, but remove the chained
# request-suite imports so this diagnostic cannot mutate request state twice.
sed \
  -e '/workforce-request-contract-regression/d' \
  -e '/workforce-request-browser-regression/d' \
  tests/workforce-approval-browser-regression.mjs > "$tmp"

if grep -q 'workforce-request-.*regression' "$tmp"; then
  echo "approval-only runner still contains chained workforce request regression imports" >&2
  exit 1
fi

node "$tmp"
