# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #789 / run `35495483199`.
- Verified production SHA: `19feaa88744939eba6c6b28cdcc57b290ad72029`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #927: PASS.
- Inventory Site Production Audit #47 / run `35495707381`: PASS.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item and location archive integrity hardening.
- Catalog sync removed from physical stock authority.
- Product modal stock fields use dedicated inventory APIs.
- Generic Super Admin inventory lifecycle bypass closed.
- Live GitHub & Handoff deployed to VPS.
- One canonical public handoff URL deployed through GitHub Pages.

## IN PROGRESS — inventory minimum history

Branch:

- `fix/inventory-minimum-history-20260920`

Schema:

- remains `024`.

Confirmed gap:

- `set-minimum` mutated minimum without history;
- Inventory History could not show minimum before/after or actor.

Candidate behavior:

- transactional `set-minimum`;
- row lock before read/update;
- history only when minimum actually changes;
- transaction action remains `adjust`;
- metadata marks `operation='set_minimum'`;
- History UI displays `標準量調整 / Điều chỉnh định mức`;
- dynamic API regression checks change/no-op/clear history;
- static contract protects the behavior.

## NEXT

1. Open PR so Live Handoff automatically publishes this branch/head/fix chain.
2. Run full CI.
3. Fix any API/history/browser regression without reverting transactional history.
4. Merge only after release certification is green.
5. Deploy exact tested commit; schema remains 024.
6. Verify production Inventory Audit remains clean.
7. Continue auditing remaining non-quantity configuration mutations after this slice.

## BLOCKED

- No production data blocker.
- Do not add a new transaction action/schema unless existing `adjust + operation metadata` proves insufficient.
