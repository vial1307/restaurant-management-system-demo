# SDD Delta — Persistence status observer root scope v2

Date: 2026-09-08
Base production: `641d1ae5f55aac3d7929ccd52b0de0f33e149ddb`
Priority: P2 render lifecycle performance

## Problem

`business-persistence-status.js` observes `#app` with `{ childList: true, subtree: true }`. Section Render API v3 already emits a transient direct child mutation on the app root (`shitu-render`) after stable section updates, while first/corruption fallback renders naturally replace direct root children.

The subtree observer therefore wakes for internal child-list mutations inside `.page-content` that are not needed to detect the application render lifecycle. It can also observe persistence-notice insertion/replacement performed by its own reconciliation path.

## Required behavior

- observe only direct child-list mutations on `#app` for render lifecycle reconciliation;
- do not observe the entire app subtree;
- keep explicit persistence-status, active-site, auth, VPS-ready/expired, storage and visibility reconciliation events;
- preserve notice behavior across route changes and responsive viewports;
- preserve the stable-root lifecycle marker that makes direct-root observation sufficient;
- do not change persistence state semantics, business synchronization, auth, inventory, database or VPS configuration.

## Acceptance

- performance contract rejects `subtree: true` and requires direct-root `childList` observation;
- contract confirms `stable-app-root.js` still emits the transient `shitu-render` direct-root marker;
- existing browser persistence-status regression remains green;
- preflight, API/PostgreSQL, Chromium desktop/mobile, recovery/persistence and full-device cross-browser gates remain mandatory before merge;
- production completion requires exact-SHA deploy, health/release and production UI smoke.

## Rollback

Restore `{ childList: true, subtree: true }` on the `#app` observer. No data migration is required.
