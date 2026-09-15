#!/usr/bin/env bash
set -euo pipefail

tmp="tests/.workforce-approval-browser-regression-only.mjs"
trap 'rm -f "$tmp"' EXIT

sed \
  -e '/^await import("\.\/workforce-request-contract-regression\.mjs");$/d' \
  -e '/^await import("\.\/workforce-request-browser-regression\.mjs");$/d' \
  tests/workforce-approval-browser-regression.mjs > "$tmp"

node "$tmp"
