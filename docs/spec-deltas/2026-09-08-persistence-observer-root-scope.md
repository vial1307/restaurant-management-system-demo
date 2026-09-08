# SDD Delta — Persistence status observer root scope

Date: 2026-09-08
Base production: `02a75ac9eb296f55d647e46b5bda02c92704c117`
Priority: P2 render lifecycle performance

## Problem

`business-persistence-status.js` currently observes `#app` with `{ childList: true, subtree: true }`. After Section Render API v3, every stable render emits a transient direct child mutation on the app root (`shitu-render`), while first/corruption fallback renders naturally replace direct root children.

The subtree observer therefore wakes for many internal child-list mutations inside `.page-content` even though those mutations are not required to detect a render lifecycle. `scheduleRender()` coalesces work and `ensureNotice()` is idempotent, but the broad observer still creates avoidable observer callbacks/microtasks and can observe its own notice insertion/replacement.

## Required behavior

- Observe only direct child-list mutations on `#app` for render lifecycle reconciliation.
- Do not observe the entire app subtree.
- Keep the existing explicit event triggers for persistence status, active-site changes, auth synchronization, VPS auth readiness, auth expiration, storage changes, and visibility changes.
- Preserve persistence notice behavior across every route render and all current responsive viewports.
- Preserve the stable-root lifecycle marker and native first/fallback render behavior that make direct-root observation sufficient.
- Do not change persistence state semantics, save/error copy, site/user scoping, business-state synchronization, auth, inventory, database, or VPS configuration.

## Acceptance

- Static performance contract rejects `subtree: true` on the persistence-status observer and requires direct-root `childList` observation.
- Static contract confirms `stable-app-root.js` still emits the transient `shitu-render` direct-root marker.
- Existing browser persistence-status regression must remain green, including the loop that verifies unresolved status across all application routes and mobile viewport overflow checks.
- Normal preflight, API/PostgreSQL concurrency, Chromium desktop/mobile, recovery/persistence, full-device cross-browser, exact-SHA deploy, health/release and production UI smoke remain mandatory.

## Rollback

Restore `{ childList: true, subtree: true }` on the `#app` observer. No data migration or rollback is required.
