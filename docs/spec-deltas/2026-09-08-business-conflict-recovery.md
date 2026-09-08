# SDD Delta — Business-state conflict recovery

Date: 2026-09-08
Base production: `262646e8037748a0ee999ec0b433b22cfc9966b6`
Priority: P1 data-safety / multi-user reconciliation

## Problem

The server already rejects stale module writes with `BUSINESS_STATE_CONFLICT`, but the browser retained the conflicting local module in a pending draft with the stale expected revision. Reload/focus could therefore retry the same stale token indefinitely.

A second recovery capture for the same user/site also replaced the previous recovery draft wholesale, risking loss of an earlier unsynchronized module copy.

## Required behavior

- never auto-overwrite the server after a concurrency conflict;
- preserve the local value of every conflicting module in device recovery storage;
- merge new recovery modules into an existing user/site recovery draft instead of discarding older recovery modules;
- reconcile the visible conflicting module to the authoritative module snapshot returned by the 409 response;
- advance the accepted token only to the authoritative revision returned for that conflicting module;
- remove the stale conflicting module from the pending-save draft so it cannot retry forever;
- continue saving unrelated non-conflicting dirty modules independently;
- if recovery storage cannot be written, keep the old local/pending state and surface an error instead of discarding data;
- do not change backend, database schema, permissions or inventory semantics.

## Acceptance

The module-revision runtime regression must prove the conflicting local value survives in recovery storage, an existing recovery module remains present, visible state adopts the server snapshot, the stale pending draft is cleared, and no extra GET or false saved status is emitted. Full API/PostgreSQL/browser/full-device gates remain mandatory before merge.
