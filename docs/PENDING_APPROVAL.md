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

A load smoke test against the isolated CI database may be added safely without approval; only production stress is held here.

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

## P1 — Whole-app render architecture refactor

Status: PENDING APPROVAL

Reason: replacing the current broad `store.subscribe(renderWhenAuthorized)` / application-shell re-render model with granular page/component rendering is a deep frontend architectural change and has a high regression surface.

Goal after approval:

- local updates should render only the affected page/region;
- navigation should preserve stable shell DOM;
- background synchronization should not rebuild unrelated modules;
- measurable reduction in long tasks/layout work.

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
