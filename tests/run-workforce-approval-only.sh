#!/usr/bin/env bash
set -euo pipefail

WORKFORCE_APPROVAL_ONLY=1 node tests/workforce-approval-browser-regression.mjs
