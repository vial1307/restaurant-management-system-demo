# SDD Delta — Mobile inventory certification and auth-grace inventory retry

Date: 2026-09-09
Base main candidate: `73f89cc895fc352db21e1514de275c25893a9fb6`
Priority: P1 inventory availability / release-gate reliability

## Problem

After authoritative inventory hydration removed legacy default rows, main full-device certification reproduced the same WebKit manager failure twice: the Fuxing Manage page contained no product rows or stocktake controls even though preflight, API/PostgreSQL, Chromium, recovery and persistence all passed.

A first test-only patch proved this was not merely an immediate selector race: WebKit still had no Manage product row after 10 seconds. The runtime path explains the symptom. During the five-second post-login grace period, an inventory GET can receive `AUTH_REQUIRED`; `apiRequest()` intentionally does not expire the just-created local session during that grace window, but `runInventorySync()` previously swallowed the failed sync and did not retry until the 60-second poll/focus lifecycle. The UI could therefore remain authorized but empty.

A temporary diagnostic run then established the CI-specific WebKit behavior without changing production semantics. All WebKit role/site certification cases used the existing browser-context login fallback, but every observed inventory request returned HTTP 200. Manager Fuxing received two 200 responses, employee Fuxing received one 200 response, and Central received two 200 responses; all three cases passed. Therefore the fallback itself was not shown to generate an inventory `AUTH_REQUIRED` failure. The temporary diagnostic logging was removed before final certification.

## Required behavior

- branch Manage certification waits for a real product row before evaluating positive/negative stocktake controls;
- if an inventory sync receives `AUTH_REQUIRED`, inventory-cloud schedules at most one bounded retry after login grace;
- if the session is gone or VPS auth is no longer ready when the timer fires, the retry is abandoned;
- a successful sync clears any pending auth retry;
- after grace, a persistent 401 still follows the existing auth-expiry behavior; the fix must not mask genuine expired sessions;
- no permission widening, PostgreSQL schema change, inventory mutation semantic change or API route change;
- the full-device certification remains a blocking release gate.

## Acceptance

A runtime regression must prove login success followed by one inventory `AUTH_REQUIRED` schedules a bounded retry and that the successful retry applies an authoritative Fuxing snapshot. Existing serialization, empty-snapshot and hydration-authority regressions remain mandatory. The final PR tree must pass a clean full PR gate with no temporary diagnostics, including WebKit manager/employee/Central cases. Because this gate has shown intermittent WebKit behavior, the regression job should also pass a second consecutive run before merge. Main must then pass full-device before exact-SHA deploy, health/release and production smoke.