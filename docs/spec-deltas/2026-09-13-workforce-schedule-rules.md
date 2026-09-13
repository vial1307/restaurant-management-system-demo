# Workforce configurable scheduling / shift rules

Date: 2026-09-13
Status: implementation delta

## Goal
Move the scheduling constants that already govern Kitchen OS into manager-configurable, server-owned rules without inventing new wage, overtime, holiday, leave-pay, or staffing semantics.

## Current behavior that becomes configurable
The defaults MUST reproduce current production behavior exactly:

### Shift windows
- morning: 10:00–16:00
- evening: 16:00–22:00
- full: 10:00–22:00
- custom remains user-entered and has no default window

### Dinner-table staffing bands
- 0–3 tables: 2 inside staff, rotating coverage, manual review
- 4–6 tables: 3 inside staff, rotating coverage, no manual review
- 7–12 tables: 4 inside staff, fixed-area coverage, no manual review
- 13+ tables: 4 inside staff, fixed-area coverage, manual review

Required fixed areas remain noodles, soup, seafood, meat. This slice does not make station taxonomy configurable.

## Storage and ownership
Canonical rules live at `business_state.modules.schedule.rules`.

Rules are server-owned workflow/configuration state:
- Generic schedule saves MUST preserve the stored canonical `rules` object.
- Generic saves also continue preserving `requests` and `exceptions`.
- Rule updates use a dedicated workforce endpoint under the schedule module transaction and audit flow.
- No SQL/schema migration is introduced; existing PostgreSQL JSONB storage is reused.

## Authorization
Rule mutation is allowed only when all are true:
- authenticated role is `admin` or `manager`
- user has schedule edit permission
- requested site is allowed

`supervisor`, `employee`, and `parttime` MUST NOT mutate schedule rules even if legacy permission bits contain edit=true.

Employee/part-time self-service does not need the staffing-rule payload; their business-state response should continue to expose only own schedules/requests/exceptions needed for self-service.

## Rule shape
Canonical schedule rules are normalized to:

```json
{
  "version": 1,
  "updatedAt": null,
  "updatedByUserId": "",
  "updatedByName": "",
  "shifts": {
    "morning": { "start": "10:00", "end": "16:00" },
    "evening": { "start": "16:00", "end": "22:00" },
    "full": { "start": "10:00", "end": "22:00" }
  },
  "staffingBands": [
    { "minTables": 0, "maxTables": 3, "requiredInside": 2, "fixedAreas": false, "needsReview": true },
    { "minTables": 4, "maxTables": 6, "requiredInside": 3, "fixedAreas": false, "needsReview": false },
    { "minTables": 7, "maxTables": 12, "requiredInside": 4, "fixedAreas": true, "needsReview": false },
    { "minTables": 13, "maxTables": null, "requiredInside": 4, "fixedAreas": true, "needsReview": true }
  ]
}
```

`version` increments server-side on each successful change.

## Validation
- Shift keys are fixed to `morning`, `evening`, `full` in this slice.
- Shift start/end must be valid `HH:MM` values and cannot be identical. Cross-midnight ranges are allowed.
- `staffingBands` must contain exactly four ordered bands in this slice.
- First band starts at 0.
- Each finite band has integer `minTables <= maxTables`.
- Adjacent bands are contiguous (`next.minTables = prior.maxTables + 1`).
- Only the final band may have `maxTables = null`.
- `requiredInside` is an integer from 1 through 20.
- `fixedAreas` and `needsReview` are booleans.
- Invalid input fails closed and does not mutate business state.

## Scheduling behavior
- Existing schedule assignments retain their stored `start` and `end`; changing rules MUST NOT rewrite old assignments.
- New schedule assignments use current configured shift windows as defaults in the manager UI.
- Existing shift identifiers and matching semantics remain unchanged (`morning`, `evening`, `full`, `custom`).
- Capacity assessment uses the current configured staffing band for dinner reservation table count.
- Fixed-area capacity still checks SOP qualification for noodles/soup/seafood/meat.
- Leave/change request source snapshots continue comparing stored schedule assignments only; changing rules alone MUST NOT invalidate a pending request.

## UI
Manager/admin schedule page adds a bilingual rules editor (`Quy tắc ca / 班別規則`) available on desktop and mobile.

The editor exposes:
- start/end for morning, evening, full
- the four existing staffing bands: table range, required inside count, fixed-area toggle, manual-review toggle

Supervisor and self-service roles do not receive mutation controls.

## Audit and revisions
A successful rule update:
- increments schedule module revision
- increments rule `version`
- records actor, timestamp, before/after data and site in the existing audit log

No-op update returns unchanged and does not create a new version/audit row.

## Regression contract
Dedicated coverage must prove:
1. Legacy/no-rules state resolves to exact current production defaults.
2. Manager/admin can save a valid rule set.
3. Supervisor and employee/part-time cannot save rules.
4. Generic schedule saves cannot forge or delete rules.
5. Invalid times and invalid/non-contiguous staffing bands are rejected.
6. Existing stored assignments are unchanged after a rule update.
7. Capacity calculation follows updated staffing bands.
8. New schedule modal defaults follow updated shift windows.
9. Pending leave/change requests are not made stale solely by a rule edit.
10. Schedule module revision and audit behavior are correct.
11. Desktop/mobile manager UI works and non-management controls remain absent.
12. Existing workforce correction, payroll history, request, and full release regressions remain green.
