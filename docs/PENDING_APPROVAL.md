# Kitchen OS — Pending Approval

This file records changes that are intentionally **not** applied automatically because they can materially affect production data, business semantics, infrastructure availability or deployment risk.

Safe bug fixes, regression tests, responsive fixes, request deduplication, permission enforcement and non-destructive deployment fixes do not need to wait here when they preserve approved behavior.

## P1 — Production VPS load/stress test

Status: PENDING APPROVAL

Reason: a real load test against the live VPS can consume CPU, RAM, database connections and network capacity and could degrade service for active users.

Proposed test stages after approval:

- 10 concurrent users
- 25 concurrent users
- 50 concurrent users
- 100 concurrent users

Measure:

- API p50/p95/p99 latency
- error rate
- PostgreSQL pool saturation
- CPU/RAM
- database CPU/I/O
- request queueing
- inventory transaction correctness under concurrency

Safe CI coverage: an isolated API load smoke now runs against the CI PostgreSQL container at 10, 25 and 50 concurrent clients. It measures p50/p95/p99/max latency and fails on HTTP/request errors or excessive latency. This does **not** exercise the production VPS and does not replace the production stress test above.

## P1 — Host-level VPS monitoring stack

Status: PENDING APPROVAL

Reason: installing host/container monitoring changes VPS infrastructure and long-running services.

Preferred direction:

- self-hosted metrics only;
- no third-party application-data processor;
- CPU/RAM/disk/network;
- Docker container resource usage;
- PostgreSQL pool/query health;
- API latency/error rate;
- alert thresholds documented in the repo.

## Completed — Stable shell section rendering

Status: COMPLETED 2026-09-08

The previous whole-app render architecture item is no longer pending. Production now uses the bounded section-render API for sidebar, topbar, page, mobile navigation and root overlays while preserving the legacy full-render fallback for corruption recovery. PR #50 passed static/performance, API/PostgreSQL, Chromium, recovery/persistence and full-device cross-browser regression, then exact-SHA VPS deploy, health/release verification and production UI smoke.

Further component/row-level rendering optimizations remain optional performance work and must preserve current business behavior.

## P1 — Business-state concurrency model

Status: PENDING APPROVAL

Reason: current non-inventory business modules are persisted by site/revision in `business_state`. Moving to per-module/per-record optimistic concurrency, conflict resolution or realtime push changes database/API semantics and requires a deliberate migration.

Goal after approval:

- prevent accidental last-write-wins when two users edit the same module concurrently;
- detect stale revision writes;
- return a clear conflict response;
- optionally add self-hosted realtime delivery later without changing PostgreSQL authority.

## P2 — Physical-device release certification

Status: PENDING OPERATIONAL SETUP

Reason: CI can exercise Chromium, Firefox and WebKit engines, but a literal physical iPhone/Android test needs actual devices or an approved device lab. No external testing platform should be added as a deep dependency without owner approval.

Suggested physical smoke set:

- iPhone Safari
- Android Chrome
- iPad/tablet Safari
- Windows Chrome/Edge

Major releases should use this checklist after hardware is available.
