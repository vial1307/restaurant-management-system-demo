# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #793 / run `35496998332`.
- Verified production SHA: `ccef35dad7027808d60b3a691925fbebc29b9eb4`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #928: PASS.
- Inventory Site Production Audit #51 / run `35497249172`: PASS after rerun.
- Initial Audit #51 attempt: transient SSH reset before SQL checks; no data failure.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item/location lifecycle and site-integrity hardening.
- Catalog sync removed from physical stock authority.
- Generic Super Admin inventory lifecycle bypass closed.
- Live GitHub & Handoff deployed.
- Minimum changes are transactional and visible in Inventory History.
- No-op minimum saves do not create duplicate history.
- PR #129 / production #793 verified on schema 024.

## IN PROGRESS — receive-default audit

Branch:

- `fix/inventory-receive-default-audit-20260920`

Schema:

- remains `024`.

Confirmed gap:

- direct receive-default edits preserved only the latest row state;
- delete removed the row entirely;
- there was no durable before/after audit trail.

Candidate behavior:

- transaction for create/update/delete;
- advisory lock serializes `site + catalogKey` even when row is absent;
- existing row is locked before change;
- no-op set/delete creates no audit and no timestamp churn;
- real changes write `audit_logs`;
- action: `inventory_receive_default_change`;
- metadata operation: `create/update/delete`;
- before/after: location id + location code;
- Super Admin Audit API can filter these entries.

## NEXT

1. Open PR so Live Handoff publishes this branch/head/fix chain.
2. Run static + API regression; confirm dedicated fixture produces exactly 3 audit rows.
3. Run full browser/full-device certification.
4. Merge only exact tested head.
5. Deploy exact merge commit; schema stays 024.
6. Run Inventory Site Production Audit; retry only transport failures, never integrity failures.
7. Continue auditing remaining non-quantity inventory configuration mutations.

## BLOCKED

- No production data blocker.
- Keep receive-default configuration audit separate from physical `inventory_transactions`.
