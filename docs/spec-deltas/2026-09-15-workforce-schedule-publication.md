# Workforce schedule publication

Date: 2026-09-15
Status: implementation target

## Goal

Separate manager schedule editing from the employee-visible schedule. Managers edit a draft roster first, then explicitly publish an immutable snapshot for employees.

## Compatibility contract

- `schedule.schedules` remains the manager working draft. Existing schedule editing, capacity calculation, recurring schedules, approved leave/swap exceptions, and UI routes continue using this field for manager/admin accounts.
- `schedule.publishedSchedules` stores the last published snapshot.
- `schedule.publication` stores publication metadata:
  - `version`
  - `publishedAt`
  - `publishedByUserId`
  - `publishedByName`
  - `scheduleCount`
  - `sourceModuleRevision`
- Before the first publication exists, employee/part-time users continue to receive the current `schedules` array as a migration fallback. This prevents existing live schedules from disappearing during rollout.
- After the first publication exists, employee/part-time users receive only their own entries from `publishedSchedules`, exposed to the existing client as `schedule.schedules`. They never receive the branch-wide published snapshot.
- Approved schedule exceptions continue to apply after publication. Leave removes the published shift and approved override/swap replaces it through the existing effective-schedule layer.
- Self-service clock-in uses the published snapshot as the canonical scheduled start after publication; before first publication it falls back to the working schedule.

## Publish operation

Endpoint: `POST /api/workforce/:site/schedule-publish`

Request body includes `expectedModuleRevision`, taken from the manager's immediately preceding authoritative schedule read.

Authorization:

- site must be valid and accessible to the authenticated account;
- only admin/manager with schedule edit permission may publish.

Atomic behavior under the business-state row lock:

1. Load the latest `schedule` module and module revision.
2. Require the stored schedule revision to equal `expectedModuleRevision`; otherwise return a publish conflict without changing data.
3. Compare `schedules` with `publishedSchedules`.
4. If identical and a publication already exists, return unchanged without incrementing revisions.
5. Otherwise copy the current `schedules` into `publishedSchedules`.
6. Increment `publication.version` and store actor/time/count/source revision metadata.
7. Increment the schedule module revision and business-state revision.
8. Add an audit log entry for `workforce-schedule-publish`.

The revision precondition prevents a manager from publishing schedule changes that another manager saved after the publisher last reviewed the draft.

## Manager UI

On the schedule page:

- show publication state and version;
- show who published and when when available;
- show `Draft has unpublished changes` when the server-side draft differs from the published snapshot;
- show a `Publish schedule` action only to admin/manager accounts that can edit schedule;
- disable publishing when no unpublished changes exist;
- before publishing, compare the local draft schedule with the latest server draft. If they differ, do not publish stale server data and instruct the user to wait until the draft finishes saving;
- publish the exact module revision returned by that latest server read;
- after a successful publish, reload the canonical business-state schedule revision before allowing subsequent edits to persist.

The publish UI must not write synthetic data directly to production PostgreSQL outside the canonical API.

## Persistence preservation

Generic manager saves of the schedule module must preserve these workflow-owned fields from the stored server module:

- `requests`
- `exceptions`
- `rules`
- `publishedSchedules`
- `publication`

This prevents normal schedule editing from deleting the last published snapshot.

## Regression requirements

Tests must verify:

- employee scope uses draft schedules before first publication;
- employee scope switches to the published snapshot after publication and only exposes own entries;
- publication metadata is safe to expose while branch-wide `publishedSchedules` is not;
- self-service scheduled start comes from the published snapshot after publication;
- generic schedule saves preserve publication fields;
- publish endpoint is manager-only, site-scoped, revision-guarded, idempotent when unchanged, increments module revision when changed, and writes an audit log;
- production smoke sees the publication control/status on the deployed schedule page without performing a publish against production data.
