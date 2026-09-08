# Spec delta — first-run inventory service-date cache consistency

Date: 2026-09-08
Status: acceptance rule for PR #47 mobile role/site certification

## Problem exposed by certification

A fresh browser/device can hydrate the Kitchen OS store in memory with the current service date while `shitu-kitchen-os-v1` has not yet been written to local cache. Inventory authorization helpers independently read that cache to decide whether a branch is on the current service date. When the cache is absent, an otherwise authorized manager/supervisor can be treated as historical/read-only until some unrelated state mutation happens to persist the store.

This is a frontend cache-coherence defect, not a change to inventory business authority.

## Required invariant

1. The application store's hydrated initial state must be mirrored synchronously to the local UI/cache store before independent frontend modules use that cache for permission or date gating.
2. This bootstrap mirror is local cache initialization only. It is not a business-data save, must not be shown as successful VPS persistence, and must not replace PostgreSQL as shared authority.
3. Fuxing and Yongji must behave identically on a first-run/fresh browser session.
4. Branch direct stocktake authority remains limited to the current service date and the existing authorized roles. Initializing the cache must not grant a permission the account does not already have.
5. Historical service dates remain read-only for branch direct stock correction under the existing rules.

## Acceptance criteria

- With an empty browser cache, a Fuxing manager with inventory edit permission reaches the current service date with direct stocktake controls available.
- The same fresh-session behavior holds for a Yongji manager and an authorized supervisor.
- An employee/part-time account does not gain direct stocktake authority from cache initialization.
- Selecting a historical date still removes current-day direct stocktake capability.
- Bootstrap cache initialization performs no inventory mutation API/database write and never reports a server save.
- Existing desktop/mobile, Chromium/WebKit, site-isolation, permission and PostgreSQL regression suites remain green.
