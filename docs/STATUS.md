# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. `docs/WORK_LOG.md` is the chronological evidence log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #767 / run `35456380284`.
- Verified production SHA: `04718106c7558a2f20f8e1551d17767e3bff1230`.
- Production schema: `022`.
- Production UI smoke: PASS.
- Inventory Site Production Audit #24: completed read-only diagnostics.
- Cross-site inventory contamination: 0.

## CONFIRMED PRODUCTION DEFECT

Deep inventory audit found 4 hidden stock rows under inactive items.

Affected item keys:

- `fuxing:duck-tongue`
- `fuxing:freezer-kombu-broth-small`

Total hidden physical quantity visible in the audit rows:

- duck tongue: 22 across three locations;
- small frozen kombu broth: 40 in Fuxing large freezer.

The values remain in PostgreSQL; they are hidden because the item rows are inactive.

Root cause is the dedicated catalog archive endpoint missing the server/database `ITEM_HAS_STOCK` guard that the frontend already expected.

## IN PROGRESS — archive integrity fix

Branch:

- `fix/inventory-hidden-stock-archive-integrity-20260920`

Changes in progress:

- schema 023 hidden-stock recovery;
- DB archive guard;
- DB inactive-item stock guard;
- transactional catalog archive;
- archive audit history;
- API regression for block -> clear -> archive;
- DB migration/trigger regression;
- production verifier upgraded to schema 023 and hidden-stock checks.

## NEXT

1. Complete CI on the fix branch.
2. Merge only when API/database/browser/full-device gates are green.
3. Deploy exact tested commit with PostgreSQL backup.
4. Confirm migration 023 reactivates the two affected Fuxing items without changing quantities.
5. Confirm production hidden-stock counts become zero.
6. Confirm Inventory Site Production Audit remains zero for cross-site contamination.
7. After this fix is stable, resume schedule relational-read certification separately.

## BLOCKED

- Do not manually delete/zero the hidden production rows before migration 023; their quantities are treated as real physical stock until an operator corrects them through normal stocktake/transfer flows.
