# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #796 / run `35500763361`.
- Verified production SHA: `21d376295b6194e48bfaa599fc6c5424256a6196`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #929: PASS.
- Inventory Site Production Audit #54 / run `35500993290`: PASS.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item/location lifecycle and site-integrity hardening.
- Catalog sync removed from quantity/minimum authority.
- Minimum changes are transactional and visible in Inventory History.
- Receive-default create/update/delete are durably audited.
- No-op receive-default saves/deletes create no audit.
- Live GitHub & Handoff deployed.
- PR #130 / production #796 verified on schema 024.

## IN PROGRESS — inventory catalog audit

Branch:

- `audit/inventory-config-next-20260921`

Schema:

- remains `024`.

Confirmed gap:

- catalog metadata/storage-association edits had no durable before/after audit;
- repeated no-op saves still ran the item upsert path.

Candidate behavior:

- transaction + advisory lock per item key;
- lock existing item before comparison;
- update metadata only on real change;
- snapshot metadata + configured locations before/after;
- audit action `inventory_catalog_change`;
- entity id uses searchable `item_key`;
- no-op save creates no audit;
- catalog payload quantity/minimum stay non-authoritative and ignored.

## NEXT

1. Open PR so Live Handoff publishes this branch/head/CI.
2. Run static + API regression.
3. Verify catalog create/no-op/update produces exactly 2 audit rows.
4. Verify quantity/minimum stay zero for catalog-only fixture.
5. Run browser/full-device certification.
6. Merge only exact tested head.
7. Deploy exact merge commit and run Inventory Site Production Audit.
8. Continue auditing remaining inventory configuration mutations.

## BLOCKED

- No production data blocker.
- Do not move catalog configuration events into `inventory_transactions`; they belong in `audit_logs`.
