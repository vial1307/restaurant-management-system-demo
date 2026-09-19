# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. This is the short operational workboard; `docs/WORK_LOG.md` remains the chronological log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Production data authority: Browser/UI -> VPS API -> PostgreSQL.
- PostgreSQL stays private behind the VPS/API boundary.
- Verified production commit: `6f391421881e6e4aa687ed8cca85d751f96efadb`.
- Verified production workflow: Deploy Kitchen OS to VPS #754, run `35430241680`.
- Verified production schema: `022`.
- Production UI smoke: PASS.
- Inventory Site Production Audit #8: PASS.
- Cross-site integrity after deploy: 0 stock-site mismatches, 0 receive-default mismatches, 0 unknown item-site prefixes.

## Release #754 completed — 2026-09-19

Release #754 production-verifies the inventory site-isolation hardening.

Verified release evidence:

- exact deploy target: `6f391421881e6e4aa687ed8cca85d751f96efadb`;
- preflight: PASS;
- API/inventory regression: PASS;
- PostgreSQL concurrency regression: PASS;
- desktop/mobile Chromium regression: PASS;
- full-device cross-browser regression: PASS;
- pre-deploy PostgreSQL backup created successfully;
- pre-migration inventory isolation audit: PASS;
- migration `022_inventory_site_isolation.sql`: applied;
- schema verifier: `022`;
- inventory site-isolation triggers: 3;
- production health/release check: PASS;
- production UI smoke: PASS;
- post-deploy Inventory Site Production Audit: PASS.

Production audit values after schema 022:

- `stock_site_mismatch = 0`;
- `receive_default_site_mismatch = 0`;
- `unknown_item_site = 0`.

This confirms that Central / Fuxing / Yongji share one PostgreSQL database but remain independent inventory sites. A normal quantity edit in Fuxing does not update Yongji or Central. Only explicit cross-site shipment/transfer flows may update more than one site.

## Inventory invariants now enforced

- Item identity carries a valid site prefix.
- Stock item-site must equal storage/work-location site.
- Receive-default site must equal location site.
- Interactive branch switching fetches a fresh PostgreSQL snapshot before committing the active site.
- Failed target hydration keeps the previous active site.
- Fuxing and Yongji use site-scoped browser mirrors; local cache is never shared authority.
- Offline/staging branch drafts cannot seed from another site's record.
- Storage relocation such as `大冷凍 -> 大冷藏 / 四門冰箱 / 廚房冰箱` uses a PostgreSQL transaction.
- Full relocation moves quantity, safely merges minimum, moves the fixed receive-default when applicable, and writes audit history.
- `庫存轉撥` remains same-site movement; `出貨` remains cross-site movement.

## Active work — warehouse switch feedback

Branch: `feat/inventory-switch-feedback-release-handoff-20260919`

Goal:

- make the already-safe site switch visually obvious while PostgreSQL hydration is pending;
- keep every warehouse button disabled during the transition;
- visually mark the requested target site as loading;
- keep Super Admin GitHub/Handoff aligned with the verified schema-022 production baseline.

No inventory authority change is introduced by this polish.

## Current continuation point

Verified baseline:

- production SHA `6f391421881e6e4aa687ed8cca85d751f96efadb`;
- schema `022`;
- release workflow #754 / run `35430241680`;
- no production inventory integrity blocker.

Next queue:

1. Finish the visible warehouse-switch loading feedback and its regression.
2. Keep Inventory Site Production Audit mandatory after every production deploy touching inventory.
3. Never allow generic catalog metadata to simulate physical stock relocation.
4. Continue the relational/domain redesign only after preserving the schema-022 inventory invariants.
5. Keep Browser/UI -> VPS API -> PostgreSQL as the only authoritative write path.

## Handoff rule

Before stopping work:

1. update this file with DONE / IN PROGRESS / NEXT / BLOCKED;
2. append the session to `docs/WORK_LOG.md`;
3. update `docs/CURRENT_HANDOFF.md` with exact verified production evidence;
4. keep the Super Admin GitHub/Handoff metadata aligned with the current continuation point;
5. never label a release as verified until deploy release check and production UI smoke are green.
