# Inventory live authority + Fuxing reconciliation · 2026-09-11

## Problem

Two browsers could display different branch inventory because `selectedDate` is persisted per device. Branch inventory hydration correctly refuses to overwrite a historical record, but a stale persisted service date could silently keep a device in historical read-only mode when the operator later entered Inventory.

PostgreSQL remains the only shared inventory source of truth. The database is not locked; local inventory writes remain prohibited while the VPS backend is configured.

## Required behavior

1. Entering the Inventory route starts in the current service date and hydrates the current VPS/PostgreSQL snapshot.
2. A stale persisted service date must not silently pin a live Inventory visit to an old local snapshot.
3. Historical dates remain available only after an operator intentionally chooses a historical service date during the current Inventory visit, and branch inventory remains read-only there.
4. The same authorized site + item + location must converge to the same PostgreSQL quantity across desktop/mobile after synchronization.
5. The live-date guard must not add another polling loop; existing inventory sync remains responsible for boot/focus/visibility/hashchange/poll refresh.

## Authoritative Fuxing data reconciliation

Migration `009_fuxing_large_freezer_authoritative_reconcile_20260911.sql` reasserts the 51 user-confirmed Fuxing `大冷凍` rows in PostgreSQL.

- Exact location: `fuxing-large-freezer` only.
- Item master data (Traditional Chinese name, Vietnamese name, unit, work area, active/storage-only state) is reconciled for the supplied items.
- Existing minimum quantities are preserved.
- Other Fuxing storage/work locations, Yongji, and central inventory are not zeroed, moved, or inferred.
- Every quantity write is read back in the same database transaction and the whole transaction fails unless all 51 rows are processed.
- Changes are recorded in `inventory_transactions` and a reconciliation event is recorded in `audit_logs`.
- Mixed units are not guessed. Residual grams/pieces are retained in audit metadata when no explicit conversion factor exists. In particular, `舒肥雞` remains 18 in its configured `包` quantity while the additional 140 pieces remain source detail.

## Versioning

Database migration ledger advances from `008` to `009`. Inventory API contract version remains `11`; these version numbers describe different contracts and must not be conflated.
