# SDD Delta — Mobile inventory certification render readiness

Date: 2026-09-09
Base main candidate: `73f89cc895fc352db21e1514de275c25893a9fb6`
Priority: P1 release-gate reliability

## Problem

The full-device role/site certification waits for the inventory cloud/schema state to become `ready`, opens the branch Manage tab, and immediately counts stocktake controls. Backend readiness does not guarantee that the asynchronous site snapshot has already been applied and rendered. WebKit can therefore reach the assertion while the Manage list is still empty, producing `webkit-managerfx-390x844: stocktake controls missing` even though the same tested tree passes the PR run and all API/Chromium gates.

The failure reproduced twice on main and both artifacts stopped at the same assertion.

## Required behavior

- opening the Manage tab must wait for a visible product edit row/control before evaluating stocktake-control presence;
- authorized stocktake roles must still require at least one direct stocktake control;
- unauthorized roles must still require zero direct stocktake controls after a real product row is present;
- no production runtime, permission, inventory, PostgreSQL, API, or UI behavior changes;
- the full-device certification remains a blocking release gate.

## Acceptance

The complete PR gate must pass, including the WebKit manager/employee/Central cases, before merge. Main must then pass the same full-device gate before exact-SHA deploy and production smoke.
