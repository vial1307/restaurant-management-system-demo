# Spec delta — Business-state trigger coalescing

Status: required behavior for the 2026-09-06 synchronization hardening phase.
Parent specification: `docs/SYSTEM_SPECIFICATION.md`, section 22.

## Problem

Browser/PWA resume can emit `visibilitychange` and `focus` almost back-to-back. Online/auth readiness can also overlap those refresh triggers. If each trigger starts an independent business-state save while the first write is still in flight, the same local snapshot can be written to PostgreSQL more than once and unnecessarily advance `business_state.revision`.

## Required behavior

- At most one business-state VPS save may be in flight for the same loaded user/site identity.
- Concurrent refresh triggers must share the active persistence attempt instead of creating duplicate writes for the same snapshot.
- A local edit made while a save is in flight must remain detectable; sharing the in-flight save must not clear a newly scheduled debounce save.
- If the in-flight save reports that a newer local edit appeared, refresh must not load stale server state over that newer edit.
- Focus, visible-resume, online, auth-refresh, safe-reload and warehouse-switch behavior defined by the master specification remains unchanged except for write coalescing.

## Acceptance criteria

1. Fire visible-resume and focus while one VPS business-state save is deliberately held in flight.
2. Exactly one VPS save call is created for that shared snapshot.
3. Both triggers may await the same save result, but they must not produce a second write/revision bump.
4. Existing failed-save, newer-edit, safe-reload and site-switch regression tests remain green.

No database schema, inventory semantics, business permissions, or business rules change in this phase.
