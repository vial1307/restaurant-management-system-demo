## BLOCKED — Verify Fuxing supplier SOP location/unit mapping (read-only audit 2026-10-11)

- Run `38068035044` PASS against production schema `034`; **no writes**. Runtime deployment remains `13c1ceb`, previously verified.
- `三記魚餃`: 廚房冰箱 20/1 盒; another DB `大冷凍` location 0/20 盒; 海鮮區 0/1 盒. Distinct storage location IDs `fuxing-large-freezer` and `fuxing-lengdongerlou` share the display name `大冷凍`.
- `豬肉蛋餃`: 大冷凍 1/1 包, 海鮮區 0/0 包; `牛肉蛋餃`: 大冷凍 10/10 包, 海鮮區 0/0 包; SOP calls these `盒`, conversion unconfirmed.
- `排骨酥`: 大冷凍 3/3 斤; SOP's 3 斤 minimum already exists. `鴨肉丸`: 1/3 alert remains enabled, work location stock 0 包.
- No active Fuxing procurement supplier rows were returned. **BLOCKED on** operator mapping of `臥櫃` to actual location, `盒` vs `包`, and verified supplier assignments before new DB writes. Keep `ACTIVE_PR: none` for runtime.
- One-link Handoff auto-poll and Super Admin forced-refresh remain separate, unimplemented workstreams.

## STABLE — Procurement V2 / Fuxing stock reorder alert (verified 2026-10-10; status updated 2026-10-11)

- `ACTIVE_PR: none` for the Procurement V2 completed workstream. Production application `13c1ceb` (full main SHA `13c1cebff0254fae5dda2295ff16b4bd8679b5f8`); production PostgreSQL schema `034`.
- Main Staging #90, Production #1402 (full preflight, browser/database regression, deploy and UI smoke), and Inventory Site Audit #718 all PASS on this exact release. PR #233 is merged, not pending deployment.
- One-time Fuxing configuration: `鴨肉丸` at DB work location `海鮮區`, unit `包`, reference 1.000 包 = user-confirmed 30 viên, reorder warning at 1/3 = 10 viên or less. Guarded Production backup + write + verification workflow `38039572403` PASS; production health PASS. Inventory quantity was **not modified** (work location was 0 包 at verification).
- No automatic supplier order; no assumed supplier mapping, inventory seed, or Thursday closure policy. Other procurement notes still need explicit item/location/vendor and unit verification.
- **NEXT:** map the remaining verified Fuxing supplier SOP rules in PostgreSQL; independently improve Handoff auto-refresh/force-refresh; optionally review VPS storage. Keep older IN PROGRESS sections below for historical audit, not current state.

## IN PROGRESS — Procurement v2 responsive + PostgreSQL supplier policy, 2026-10-10

- Branch: `feat/procurement-responsive-db-v2`. Production remains untouched pending test gates; `ACTIVE_PR` not yet set.
- Replaces only `#procurement` renderer; includes one shared Desktop/Mobile bilingual UI with list, supplier, category, history and settings tabs.
- New migration `033_procurement_supplier_calendar.sql`: site supplier calendars, product usage rules linked to `inventory_items.id`, service-day overrides, order headers/lines and idempotency.
- Procurement API uses authenticated site/role checks and a PostgreSQL transaction for writes; product stock/catalog read existing inventory DB snapshot.
- No supplier/item rows seeded. Actual supplier names and product associations must be configured from verified operation records.
- Search reuses `prepareIngredientNameSearchCorpus` / `prepareIngredientNameSearchNeedle`, strict literal bilingual product names, no phonetic aliases.
- Planned/remaining verification: exact-head JS syntax; SQL staging migration; API auth/round-trip and order semantics; mobile geometry 359/390/430/760px; all branch parity; production smoke only after successful staging.
- Do not mark DONE/merge until all relevant gates pass. Existing procurement local legacy business-state may remain for historical/backcompat, not authoritative new supplier rules.

## STABLE — Staging-gated production promotion, 2026-10-08

- `ACTIVE_PR: none`.
- Production release: `2e2a42d163c741aa122bf4fbac5fe3e449001f12`; schema `032`.
- Staging is physically isolated on the VPS with its own PostgreSQL volume, API/web containers and hostname `staging.82.47.180.185.nip.io`.
- Staging clones production by read-only dump, verifies schema fingerprint parity, then applies candidate migrations only to staging and runs integrity/health checks.
- Production deployment is no longer triggered directly by `push main`; successful main staging completion is the required `workflow_run` gate.
- Exact SHA contract: PR = `pull_request.head.sha`; production = successful staging `workflow_run.head_sha`.
- Main verification: Staging #9 PASS → Production #1321 PASS on the same SHA `2e2a42d...`; production UI smoke PASS.
- Failure in staging blocks promotion without modifying production.

## ACTIVE — Operation search parity, 2026-10-07

- `ACTIVE_PR: #218`.
- Fixing search parity only for Receive / Pick / Transfer / Ship; Overview remains on the stable Search v2 implementation.
- Operation search corpus is being expanded with authoritative category, unit, receive-default and location metadata from the Inventory snapshot.
- Regression now verifies every rendered operation card's bilingual product identity is indexed.
- Production authority remains `79f1491f112c830c80da3494cb2aaf1af5ef27ba`, schema `032`.

## STABLE — Inventory search v2, 2026-10-07

- `ACTIVE_PR: none`.
- Production release: `79f1491f112c830c80da3494cb2aaf1af5ef27ba`; schema `032`.
- Search now uses curated DB-backed product/item/location corpus instead of rendered DOM text.
- Hidden 3rd+ locations are searchable; unselected select options no longer create false-positive location/Work Area matches.
- Multi-token AND matching supports product + location terms; Pinyin/注音, Pinyin initials/spaced initials and Vietnamese/Latin initials are supported.
- Central Inventory uses the same prepared-corpus and explicit hidden-state contract.
- Deploy #1286 PASS; backup `/opt/kitchen-os/backups/kitchen_os_20261007T085408Z.dump`; `DATA_INTEGRITY_OK`; production UI smoke PASS.
- Inventory Site Production Audit #597 PASS.
- Workforce Staff #838, Attendance #812, Schedule Backfill #822 and Schedule Parity #611 PASS.
- No database/schema/RBAC/stock mutation semantics changed.
- NEXT independent workstreams: Procurement mutable-master/scheduling DB migration; Handoff polling/force-refresh; VPS disk cleanup.

## STABLE — Inventory search completeness + operation UI alignment, 2026-10-07

- `ACTIVE_PR: none`.
- Production release: `9ea27adb9630bd571b5cdafcc770cdc167245c7f`; schema `032`.
- PR #215 delivered the runtime search/UI changes; PR #216 stabilized certification against realtime DOM replacement without changing runtime behavior.
- Inventory search coverage now includes overview/manage/Central plus 進貨 / 領貨 / 轉撥 / 出貨, using prepared DB-backed item/location corpus and explicit hidden-card state.
- Pinyin/注音 coverage was extended for current catalog names that were previously missing.
- Receive/Pick/Transfer/Ship share one full-width responsive layout contract with aligned controls on Desktop and stacked controls on Tablet/Mobile.
- Browser/full-device certification verifies search reduction, zero-result, clear/reset, DOM preservation, full-width cards, no overflow and no control overlap.
- Main Deploy #1281 PASS; exact release `9ea27adb9630bd571b5cdafcc770cdc167245c7f`; backup `/opt/kitchen-os/backups/kitchen_os_20261007T072844Z.dump`.
- Production health: app/database/edge healthy, schema `032`, `DATA_INTEGRITY_OK`, `PRODUCTION_UI_SMOKE_OK`.
- Inventory Site Production Audit #592 PASS.
- Workforce Staff #833, Attendance #807, Schedule Backfill #817 and Schedule Parity #606 PASS.
- No database/schema/RBAC/stock-mutation semantics changed.
- NEXT independent workstreams: Procurement mutable-master/scheduling DB migration; Handoff polling/force-refresh; VPS disk cleanup.

## STABLE — PR #214 Inventory search repair + UX polish, 2026-10-07

- `ACTIVE_PR: none`.
- Production release: `d1afe98a99f471028476126feb4b2ae5c84be977`; schema `032`.
- Exact tested PR head: `6853e70ca3eed2c85058fafee52cd60644654b29`.
- Exact-head gates PASS: Super Admin Browser #460, Workforce Diagnostic #608, Deploy/full-device #1269.
- Search behavior is fixed with an explicit `data-search-hidden` presentation contract; matching queries must now reduce visible rows under browser regression.
- Search UX includes bilingual product/pinyin/zhuyin/location placeholder, live result count, clear action and responsive light styling.
- Main Deploy #1270 PASS; backup `/opt/kitchen-os/backups/kitchen_os_20261006T214104Z.dump`.
- Production health: app/database/edge healthy, release `d1afe98`, schema `032`, `DATA_INTEGRITY_OK`, `PRODUCTION_UI_SMOKE_OK`.
- Inventory Site Production Audit #581 PASS.
- Workforce Staff #822, Attendance #796, Schedule Backfill #806 and Schedule Parity #595 PASS.
- PostgreSQL/VPS authority and all Inventory business mutation semantics remain unchanged.
- NEXT independent workstreams: Procurement mutable-master/scheduling DB migration; Handoff polling/force-refresh; VPS disk cleanup.

## STABLE — PR #213 high-fidelity Inventory/Super Admin visual parity, 2026-10-06

- `ACTIVE_PR: none`.
- Production release: `e71376e8893626e1c9bcd8c4d23dae8ba5ddf04f`; schema `032`.
- Exact tested PR head: `525c2d42cb1d95917dc107d7b9b8b283bea73131`.
- Exact-head PR gates PASS: Master Data/Admin #528, Super Admin Browser #455, Workforce Diagnostic #603, Deploy/full-device #1263.
- Earlier candidate `e2261e648314b80da5879ced9741dd1baf6d858f` correctly failed Deploy #1260 because the final desktop product grid overrode the <=1100px tablet card grid and caused 308px horizontal overflow at 844x390; fixed before merge and guarded by regression.
- Merged as `e71376e8893626e1c9bcd8c4d23dae8ba5ddf04f`.
- Main Deploy #1264 PASS; backup `/opt/kitchen-os/backups/kitchen_os_20261006T133704Z.dump`.
- Production health: app/database/edge healthy, release `e71376e`, schema `032`, `DATA_INTEGRITY_OK`, `PRODUCTION_UI_SMOKE_OK`.
- Inventory Site Production Audit #574 PASS on attempt 2 after an attempt-1 transient SSH connection closure.
- Workforce Staff #815 PASS, Attendance #789 PASS, Schedule Backfill #799 PASS, Schedule Parity #588 PASS on attempt 2 after a transient SSH setup closure.
- Delivered change is visual-only: high-fidelity light Inventory + Super Admin typography, text hierarchy, cards, borders/shadows, emerald accent, spacing/radii and responsive detail/card surfaces.
- PostgreSQL/VPS authority, quantities, minimums, transactions, API/RBAC, site-scope and renderer semantics are unchanged.
- NEXT independent workstreams: Procurement mutable-master/scheduling DB migration; Handoff polling/force-refresh; VPS disk cleanup.

# Kitchen OS Engineering Status

## STABLE — PR #212 production-verified, 2026-10-06

- `ACTIVE_PR: none`.
- Production release: `b3a56ee83a0d5f00a9543f668cd95789eaa65ded`; schema `032`.
- PR #212 tested head `d382084046b9451b31bef3b931e01d98d3e5727a`: Master/Admin #520, Super Admin Browser #448, Workforce Diagnostic #596 and full-device Deploy #1255 PASS.
- Merged as `b3a56ee83a0d5f00a9543f668cd95789eaa65ded`.
- Main Deploy #1256 PASS; backup `/opt/kitchen-os/backups/kitchen_os_20261006T123406Z.dump`.
- Production health/release check PASS, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Inventory Site Production Audit #566 PASS.
- Workforce Staff #807, Attendance #781, Schedule Backfill #791 and Schedule Parity #580 PASS.
- Super Admin permission UI and Inventory multi-location UI now match the approved design while retaining PostgreSQL/VPS authority and existing business semantics.
- No schema, quantity, transaction, API or permission-semantics change in PR #212.
- NEXT: Procurement mutable-master-data DB migration remains the next runtime technical-debt workstream; Handoff polling/force-refresh and VPS disk cleanup remain separate.

## DONE — PR #211 Inventory low-stock notification center, 2026-10-06

- Merged as `2dd48d7828ea542e976170103c1132aea1f73d55`; Deploy #1250 and Inventory Audit #560 PASS.
- Baseline production remains `09fbda4291f3f02d895ae84f2779df77bcaccf76` / schema `032`.
- Adds a dedicated notification center for Out-of-stock / Low / Near-low inventory states.
- Alert severity is calculated from the same database-backed per-location minimum/warning metadata already used by Inventory rows.
- Desktop/Mobile alert filters and responsive cards are implemented.
- Clicking an alert opens the existing product detail surface; quick quantity editing remains permission-controlled.
- No new schema is required.
- Procurement source-coded product/supplier schedule data is confirmed as remaining technical debt and is intentionally moved to the next independent runtime PR.
- Production closure complete; Procurement DB migration remains deferred while PR #212 implements the already-approved UI.

## STABLE — Inventory phase 2 production-verified, 2026-10-06

- `ACTIVE_PR: none`.
- PR #207 delivered the Inventory multi-location Desktop/Mobile UI and Add/Edit Product master-data integration.
- PR #207 exact head `034144568ddc71a252c439cb65cfb922cb25c2af`: Deploy #1234, Master/Admin #510, Super Admin Browser #431, API Load #723 and Workforce Diagnostic #586 PASS.
- PR #207 merged as `5a7a37d9269aff13e45ff544d134c86bc8934475`.
- PR #208 repaired certification fixtures only; exact head `5f0506f7b4a2911ae0e91fc318caf5a8ebb8ffd7`: Deploy #1243, Master/Admin #514, Super Admin Browser #438 and API Load #725 PASS.
- PR #208 merged as `09fbda4291f3f02d895ae84f2779df77bcaccf76`.
- Final main Deploy #1244 PASS; backup `/opt/kitchen-os/backups/kitchen_os_20261006T090006Z.dump`.
- Production: release `09fbda4`, schema `032`, app/database/edge healthy, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Inventory Site Production Audit #554 PASS.
- Workforce Staff #795, Attendance #769, Schedule Backfill #779 and Schedule Parity #568 PASS.
- Multi-location UI uses Primary -> Work -> Other and 3+ locations => first 2 chips + `Xem thêm`.
- Mobile Full Screen Detail and permission-controlled minus/direct-number/plus are live.
- Category/Unit/Primary/Receive Default integration is live and PostgreSQL-backed.
- NEXT: low-stock notification UX + remaining mutable-business-data hard-code audit; Handoff auto-polling and VPS disk cleanup remain separate deferred workstreams.

## STABLE — PR #205 production-verified, 2026-10-06

- `ACTIVE_PR: none`.
- Production release: `36e0fbc0703262cc2b61f0cd7dba2fe44abc3358`; schema `032`.
- Deploy #1192 PASS including exact-SHA deploy, full-device regression and production UI smoke.
- `DATA_INTEGRITY_OK`; backup `/opt/kitchen-os/backups/kitchen_os_20261005T214747Z.dump`.
- Inventory Site Production Audit #500 PASS.
- Workforce Staff #741, Attendance #715, Schedule Backfill #725 PASS.
- Workforce Schedule Parity #514 attempt 1 hit transient SSH reset before execution; unchanged production rerun attempt 2 PASS.
- Super Admin granular Inventory permissions are live and no longer derive mutation authority from job title.
- NEXT: phase 2 Inventory multi-location Desktop/Mobile UI on a fresh runtime PR.

## APPROVED DESIGN — PR #204 Inventory permission/database/UI redesign, 2026-10-06

- `ACTIVE_PR: none`; PR #204 is documentation/design only and does not create a runtime workstream. Production runtime remains release `8a89e113...` / schema `031`.
- Approved: Super Admin-managed per-user Inventory permissions, not job-title authority.
- Site scope supports all sites or arbitrary combinations; no AB/AC/BC combinations hard-coded in source.
- Scope can be narrowed to storage locations and Work Areas.
- Approved Inventory UI: one product/row, chips ordered Primary -> Work -> other; >3 locations shows first 3 + “Xem thêm”.
- Mobile opens Full Screen Detail and uses permission-controlled quick minus/number/plus editing.
- Category and Unit become database master data; permitted unit editors may create new units through DB.
- Minimum is optional but database warning thresholds drive Near-low/Low/Out-of-stock UI.
- Receive Default is inbound routing metadata and is distinct from Primary/Work.
- All stored/moved Inventory data must pass backend + PostgreSQL; localStorage is cache/draft only.
- Handoff live-sync audit: current system is refresh-based near-live, not continuous real-time; see `docs/HANDOFF_REALTIME_CHECKLIST.md`.
- NEXT after design merge: separate runtime PR(s) for permission schema/Super Admin UI, Inventory multi-location UI, and handoff polling/force-refresh as independently gated changes.

## STABLE — no active engineering PR, 2026-10-06

- `ACTIVE_PR: none` after PR #202 production closure.
- Verified runtime release: `8a89e1135e45329d30983424d38a75b2bac44d09`; schema `031`.
- Deploy #1169 / `37342075459`: PASS including full-device, exact-SHA deploy and production UI smoke.
- `DATA_INTEGRITY_OK`; backup `/opt/kitchen-os/backups/kitchen_os_20261005T164320Z.dump`.
- Inventory Site Production Audit #477: PASS.
- Workforce Staff #718, Attendance #692, Schedule Backfill #702, Schedule Parity #491: PASS.
- Production evidence remains valid if later main commits are docs-only because workflows are resolved by recorded production SHA.
- AgentMemory is recall-only; final closure-doc snapshot will refresh on the next manual sync or runtime deploy.
- NEXT: new work must branch from current main, explicitly set a new active workstream and follow Engineering Contract exact-head/production gates.

## DONE — PR #202 production evidence docs-drift repair, 2026-10-06

- Exact PR head `153272303205a6ad62d04414b43290ed9fc3ac32`.
- PR gates: Deploy #1168 PASS; Master/Admin #444 PASS; Super Admin Browser #367 PASS; API Load #657 PASS; Workforce Diagnostic #522 PASS.
- Merged as `8a89e1135e45329d30983424d38a75b2bac44d09`.
- Added recent-main workflow history while preserving current-main exact-head workflows.
- Stable Engineering Harness now evaluates workflow evidence against the recorded production SHA when there is no active PR.
- Super Admin production Deploy/Inventory links now survive docs-only main commits.
- No Inventory business logic, PostgreSQL schema/data, RBAC/workforce mutation or warehouse-switch behavior changed.

## STABLE — no active engineering PR, 2026-10-05

- `ACTIVE_PR: none` after PR #200 production closure.
- Current production release: `2feb47e7a204ee5834aa5a45ea57f8eb349b853b`; schema `031`.
- Deploy #1165 / `37287279011`: PASS including exact-SHA deploy and production UI smoke.
- `DATA_INTEGRITY_OK`; backup `/opt/kitchen-os/backups/kitchen_os_20261005T090831Z.dump`.
- Inventory Site Production Audit #473: PASS.
- Workforce Staff #714, Attendance #688, Schedule Backfill #698 and Schedule Parity #487: PASS.
- AgentMemory seed/recall after deploy: PASS.
- NEXT: a new feature/bug task must start from current main, create a fresh PR, set `ACTIVE_PR`, classify the feature through FEATURE_REGISTRY/VERIFICATION_MATRIX, then follow exact-head CI and production evidence rules.

## DONE — PR #200 live handoff metadata reconciliation, 2026-10-05

- Tested PR head `184585968ddc50d462c4fc1b98b70ea2353d1351`.
- PR gates: Master/Admin #440 PASS; API Load #653 PASS; Super Admin Browser #364 PASS; Workforce Diagnostic #519 PASS.
- Deploy #1164 attempt 1 hit a WebKit access-control page-error flake on `webkit-managerfx-390x844`; unchanged exact head rerun passed on attempt 2.
- Merged as `2feb47e7a204ee5834aa5a45ea57f8eb349b853b`.
- Main Deploy #1165 PASS; release `2feb47e`, schema `031`, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Removed stale PR #140/schema 024/RBAC fallback state and made Super Admin production evidence prefer live runtime/main workflows.
- No Inventory business logic, PostgreSQL schema/data, RBAC or warehouse-switch semantics changed.
## DONE — Inventory performance + warehouse-switch production closure, 2026-10-05

- PR #188 merged as `1872a8daf8b5d59148de7d208519d736ceca75a5`.
- PR #198 fixed warehouse switching across rerenders with stable delegated handling.
- PR #199 hardened capture/pointer activation so switch intent is observed before rerender can replace the clicked node.
- Current main after PR #199: `05183544fd4168332f6681c8e00f46b5d9f02527`.
- Deploy Kitchen OS #1160 / `37254253521`: PASS, including production-ui-smoke.
- Inventory Site Production Audit #467 / `37254828622`: PASS.
- Workforce Staff #708, Attendance #682, Schedule Backfill #692 and Schedule Parity #481: PASS.
- Schema remains `031`.
- The old PR #188 ACTIVE/BLOCKED state is closed and must not be used as current authority.

## DONE — Engineering Harness / Coding Control Plane, 2026-10-05

- PR #196 exact tested head `56eddaeededb048f0223e4e71a376281b28d2b92`.
- PR gates PASS: Deploy #1146, Master/Admin #428, Super Admin Browser #350, API Load #641; Workforce diagnostic #505 also PASS.
- Merged as `d8e332f399f299476c939539e809a24b85e0a7e8`.
- Main Deploy #1147: first full-device attempt hit one permission-state timeout; unchanged merge SHA rerun passed per Engineering Contract.
- Production: app/database OK, schema `031`, release `d8e332f`; `DATA_INTEGRITY_OK`; production UI smoke PASS.
- Inventory Site Production Audit #451 PASS.
- Workforce Staff #692, Attendance #666, Schedule Backfill #676, Schedule Parity #465: PASS.
- VPS Capacity Audit #17 PASS.
- Super Admin → GitHub & Handoff now includes live Merge/Deploy/Production/Definition-of-Done gates, Verification Matrix, Known gaps, Evidence Center and a new-chat start packet.
- Browser regressions now reject same-origin API 5xx/request failures; the only allowed teardown exception is the expected abort of `/api/inventory/events` SSE.
- AgentMemory seeded all four engineering-standard docs; `AGENTMEMORY_SEED_COMPLETE changed=6 total=7`; authenticated recall PASS with 5 results.
- No Inventory business handler, PostgreSQL schema/data or RBAC mutation was introduced.

## DONE — AgentMemory private VPS integration + authenticated recall, 2026-10-04

- Production merge `b61ef3837750a773294c1eb230bbb48393710cf3` is verified on VPS.
- Deploy Kitchen OS #1131 / run `37192359669`: PASS.
- Health: app/database OK, schema `031`, release `b61ef38`; `DATA_INTEGRITY_OK`; production UI smoke PASS.
- AgentMemory 0.9.29 is healthy, loopback-only, persistent and protected by a VPS-only bearer secret.
- Handoff seed verified: 3 project-scoped records, SHA-256 idempotent.
- Recall verified in production: `AGENTMEMORY_RECALL_OK results=3`.
- PR #195 permanently prevents the previous false-negative where a 2,000-token narrative response budget discarded oversized handoff snapshots.
- Inventory Site Production Audit #434 and all four Workforce post-deploy backfill/parity workflows passed.
- No PostgreSQL schema or Inventory business-data change was introduced by the AgentMemory recovery.

## DONE — Fuxing 大冷凍 production stocktake, 2026-10-04

- PostgreSQL production data operation completed for `fuxing-large-freezer`.
- 51 supplied products matched 51 existing active Fuxing catalog items; 0 new catalog items were required.
- Work Area configuration was not changed.
- Import run `37178274266`: PASS; 45 quantities changed, 6 were already equal.
- Before/after changes are preserved in `inventory_transactions`; the overall operation is recorded by `stocktake_import` audit metadata.
- Mixed residual weights/pieces were retained as raw detail without inferred conversion; established `冷凍麵` 1箱 = 30片 was retained.
- Pre-write DB backup: `/home/deploy/kitchen_os_pre_stocktake_20261004T045308Z.dump` (+ SHA-256).
- Transactional verification confirmed all 51 requested target quantities before COMMIT.
- No runtime source/migration was used as quantity authority; the one-time transport workflow was removed after success.
- Production release remains the verified `337f5a2` / schema `031`; this was data-only and did not deploy application code.

## DONE — Inventory compact Pick row + overflow hardening, 2026-10-02

- PR #186 merged as `337f5a2f6a3b0bfa06916fede0b0336cee4018e2`.
- Exact PR head `abd0276abc3009ed98375b7fcf49f8ccc6beb903`: preflight, Desktop/mobile Chromium and full-device cross-browser PASS.
- Deploy #1078 / run `36904751345`: PASS.
- GitHub Pages #996 / run `36904748812`: PASS.
- Production health: release `337f5a2`, schema `031`, app/database OK.
- `DATA_INTEGRITY_OK`; production UI smoke PASS.
- Inventory Site Production Audit #368 / run `36906762392`: PASS.
- Wide Desktop Pick now renders 已領貨 → 使用 → 歸位 in one compact horizontal sequence when enough width exists.
- 901–1199px and mobile keep responsive fallbacks; 761–1100px stock/work tables use responsive cards instead of the legacy fixed 945px table width.
- Legacy operation-card internal minimums were neutralized inside the Maestro visual layer, eliminating the real 51px 入庫 overflow caught by regression.
- Tablet/landscape row layout was corrected after regression caught a real 214px overflow at 844×390.
- Long bilingual text/buttons/selects/badges/source pills are width-contained; one presentation-only i18n guard prevents duplicated structured bilingual labels.
- No Inventory business handler, API/backend, PostgreSQL/schema, RBAC, quantity/minimum, Work Area/storage, transfer/shipping or master-data authority changed.
- Latest audit: Central 41 / qty 81; Fuxing 78 / qty 1823; Yongji 75 / qty 17; all Inventory violation groups are 0; both historical branch manifests missing 0.
- Current runtime continuation baseline: `337f5a2f6a3b0bfa06916fede0b0336cee4018e2` / schema 031.

## CLOSED — Inventory overflow-hardening candidate, 2026-10-02

- Branch: `style/inventory-overflow-density-20261002`.
- Production baseline: runtime `53d218cf11b9cb1f10ceab586c402f531ff112d5`, schema 031.
- Wide Desktop: Pick follow-up uses one horizontal row for 已領貨 / 使用 / 歸位 when the viewport has enough space.
- Narrow Desktop/tablet/mobile: responsive fallback keeps controls wrapped instead of compressed.
- Global Inventory UI hardening prevents bilingual text, buttons, badges, source pills and operation controls from protruding outside their cards/rows.
- Select controls are width-bounded with ellipsis; action text wraps safely where necessary.
- Central Kitchen Inventory panels/buttons receive the same overflow contract.
- Runtime business logic remains untouched. CSS owns layout/overflow behavior; `search-i18n-layer.js` has one presentation-only guard so labels already structured by `ui-refresh.js` are not bilingualized twice.
- Browser regression now checks Inventory surface/button overflow, wide-Desktop Pick horizontal ordering, and duplicate structured bilingual labels.
- NEXT: exact-head CI → merge → production deploy/smoke/audit.

## DONE — Inventory responsive UI Phase 3 + Desktop 領貨 / 轉撥 repair, 2026-10-02

- PR #184 merged as `53d218cf11b9cb1f10ceab586c402f531ff112d5`.
- Deploy #1062 / run `36896045707`: PASS.
- GitHub Pages #994 / run `36896043714`: PASS.
- Production health: release `53d218c`, schema `031`, app/database OK.
- `DATA_INTEGRITY_OK`; production UI smoke PASS.
- Inventory Site Production Audit #350 / run `36896923185`: PASS.
- Desktop 領貨/轉撥 regression root cause was layout compression of denser operation cards inside the two-column Desktop operation grid.
- Runtime repair is CSS-only in `src/inventory-maestro-ui.css`: pick/transfer dense cards span full width, transfer balance is stable source → destination layout, and pick return controls have sufficient width.
- `tests/browser-regression.mjs` now asserts dense Desktop pick/transfer cards span the list width and do not horizontally overflow.
- No Inventory JavaScript handlers, API/backend, PostgreSQL/schema, RBAC, quantity/minimum, Work Area/storage, transfer/shipping or master-data authority changed.
- Latest audit: Central 41 / qty 81; Fuxing 78 / qty 1823; Yongji 75 / qty 17; all site/location/materialization/hidden integrity violation totals are 0; both branch historical manifests missing 0.
- Production baseline for continuation: `53d218cf11b9cb1f10ceab586c402f531ff112d5` / schema 031.

## CLOSED — Desktop 領貨 / 轉撥 UI repair candidate, 2026-10-02

- PR #183 merged responsive UI Phase 3 into `main` as `52a1344cd9f1eafec372c15feffb85660d384b4b`; production deploy #1058 did not complete successfully, so this merge commit must not be treated as verified production yet.
- Operator reported Desktop layout breakage specifically in 領貨 (pick) and 轉撥 (transfer).
- Repair branch: `fix/inventory-desktop-pick-transfer-20261002`.
- Runtime scope remains CSS-only in `src/inventory-maestro-ui.css`.
- Fix: existing pick cards (detected by `.pick-followup`) and transfer cards (detected by `.op-transfer-balance`) span the full Desktop operation grid; transfer balance and pick return controls receive stable width.
- No JavaScript handlers, API/backend, PostgreSQL/schema, RBAC, quantities/minimums, Work Area/storage, transfer semantics or business data changed.
- NEXT: exact-head regression, merge the repair PR, then deploy and verify production health/smoke.

## CLOSED — Inventory responsive UI Phase 3 candidate, 2026-10-01

- PR #183: `style/inventory-responsive-polish-20261001`.
- Candidate started from verified production `b7ffd9127987ca38e3c9dcfa79f56e3127bbc2de` on schema 031.
- Runtime scope remains presentation-only: `src/inventory-maestro-ui.css`; no JavaScript business logic, API/backend, schema, PostgreSQL data, RBAC, quantities/minimums, Work Area/storage or transfer/shipping semantics are changed.
- Desktop: increases usable inventory width at large resolutions and improves product/control readability.
- Tablet: constrains operation cards to one column where dual-column cards become cramped.
- Mobile: main operation tabs become a visible responsive grid, controls gain larger touch targets, stock/source rows wrap more safely, and Central Kitchen mode/location labels avoid unnecessary truncation.
- NEXT: run exact-head CI/full-device regression for PR #183; only merge/deploy after green results, then record the verified production SHA.

## DONE — Inventory frontend redesign/polish, 2026-10-01

- PR #176 merged as `2c7ac057605c8b21c0297326ea16e1562e125832`.
- PR #182 merged as `b7ffd9127987ca38e3c9dcfa79f56e3127bbc2de`.
- Deploy #1055 / run `36803409583`: PASS; backup `kitchen_os_20261001T020103Z.dump`.
- GitHub Pages #991 / run `36803408605`: PASS.
- Production health: release `b7ffd91`, schema `031`, app/database OK, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Inventory Site Production Audit #340 / run `36803944820`: PASS.
- Redesign is frontend presentation only. No JavaScript business logic, API/backend, schema, PostgreSQL authority, RBAC, inventory quantities/minimums, Work Area/storage semantics, transfer/shipping behavior or master-data authority was changed.
- Final polish keeps all runtime logic untouched and improves stock rows/cards, status indicators, quantity/minimum controls, source pills, actions, focus states and responsive mobile presentation.
- Full-device cross-browser regression passed on the exact PR #182 head after one unrelated navigation-context retry.
- Production inventory integrity violation totals remain 0.

## DONE — schema 031 site-scoped Work Area model, 2026-09-30

- PR #180 merged as `4ebd83f5aaccf094c354ee6798ae7e23a602b562`.
- Deploy #1046 / run `36623939891`: PASS; backup `kitchen_os_20260929T201202Z.dump`.
- Production health: release `4ebd83f`, schema `031`, app/database OK, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Inventory Site Production Audit #330 / run `36624828753`: PASS.
- Corrected the underlying model: Work Area is owned by each site, not by a global Central canonical catalog identity.
- Fuxing Work Area edits now update only Fuxing; Yongji/Central remain independent.
- Local PostgreSQL Work stock ↔ Work Area integrity is still enforced, and quantity/minimum are preserved.
- Super Admin and production audits treat cross-site Work Area differences as legitimate informational variants.
- Current production has 4 cross-site Work Area variants and 0 actual inventory integrity violations.
- NEXT: validate the previously failing product from the browser against release `4ebd83f`; any remaining popup should be handled by its exact displayed error code. Keep UI redesign separate.

## DONE — CATALOG_ITEM_NOT_FOUND on storage-only Work Area relocation, 2026-09-30

- PR #179 merged as `0839a587a91053671e0af7db41c5694eb84271c7`.
- Deploy #1040 / run `36608174657`: PASS; backup `kitchen_os_20260929T180340Z.dump`.
- Production health: release `0839a58`, schema `030`, app/database OK, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Inventory Site Production Audit #322 / run `36609522960`: PASS.
- Root cause: runtime incorrectly removed `storage_only=true` shared-catalog items from the Work Area relocation plan even though migration 027 and schema 030 treat them as valid Work Area items.
- Fix: shared Work Area coordination now includes every active shared-catalog peer regardless of `storage_only`.
- Regression now reproduces the storage-only branch case directly and passes.
- Inventory parity remains clean: Central 41, Fuxing 78, Yongji 75; all site/catalog/Work Area/legacy/hidden integrity counters are 0.
- NEXT: rebase presentation-only UI PR #176 onto release `0839a58`; do not mix UI work with inventory mutation logic.

## DONE — repeated Work Area alert / stale browser source, 2026-09-30

- PR #178 merged as `7d54cc9ac7a104711e37561d77b4045b8b3648ff`.
- Deploy #1038 / run `36599511542`: PASS; backup `kitchen_os_20260929T164701Z.dump`.
- Production health: release `7d54cc9`, schema `030`, app/database OK, `DATA_INTEGRITY_OK`, production UI smoke PASS.
- Inventory Site Production Audit #319 / run `36600414378`: PASS.
- Root cause was a browser-side authority mismatch after the DB fix: the UI could display the live VPS snapshot while an edit handler resolved the source Work Area from a historical service-date record.
- Work Area mutation now re-reads PostgreSQL, derives the source from current DB `work_area`, uses the live branch snapshot for catalog mutations and treats an already-applied move as idempotent.
- Remaining failures display their exact error code.
- Production inventory parity remains clean: Central 41, Fuxing 78, Yongji 75; Work Area sums equal each site's active catalog and all integrity counters remain 0.
- NEXT: keep inventory UI redesign isolated from runtime logic; rebase presentation-only PR #176 onto release `7d54cc9` before any UI merge.

## DONE — atomic shared-catalog Work Area relocation / schema 030, 2026-09-29

- PR #177 merged as `6588ef8e77d454ef0ccf8c027685875074d1bd04`.
- Deploy #1032 / run `36519526311`: PASS. Backup `kitchen_os_20260929T040434Z.dump`.
- Runtime health: release `6588ef8`, schema `030`, app/database OK, `DATA_INTEGRITY_OK`, Web/API/Super Admin healthy, production UI smoke PASS.
- Inventory Site Production Audit #313 / run `36520094299`: PASS.
- Schema 030 validates shared Central/branch catalog Work Area parity at transaction COMMIT, so coordinated moves succeed while partial/direct drift still fails.
- Database now additionally enforces active site+catalog uniqueness and item Work Area ↔ Work stock classification.
- Runtime Work Area relocation coordinates all shared-catalog peers atomically and preserves quantity/minimum.
- Catalog location mutation fails closed for missing/cross-site locations; transfer/relocation concurrency is serialized.
- Production parity remains clean: Central 41, Fuxing 78, Yongji 75; every Work Area sum matches its own site's active catalog; all site/classification/shared-catalog/legacy/hidden integrity counters are 0.
- NEXT: continue non-inventory hard-code audit or Super Admin inventory UX refinement; do not reintroduce frontend catalog/site/work-area authority.

## ACTIVE — runtime site-scope cleanup after PR #174, 2026-09-29

- PR #174 merged as `77d3e13077a41d82d990704abe3dd3546d2f9b91`.
- Main Deploy #1006 / run `36466950388`, attempt 5: PASS after repeated known full-device timing flakes on prior attempts.
- Production backup: `kitchen_os_20260929T004244Z.dump`; release `77d3e13`; schema `029`; `DATA_INTEGRITY_OK`; Web/API/Super Admin healthy; production UI smoke PASS.
- Inventory Site Production Audit #286 / run `36504554850`: PASS with Central 41 / Fuxing 78 / Yongji 75, Work Area parity exact per site, both 75-item branch manifests missing 0, and every site/classification/hidden-integrity violation counter = 0.
- Current branch `refactor/runtime-site-scope-cleanup-20260929` removes the next three frontend site hard-codes:
  - Business persistence status no longer keeps a `central/fuxing/yongji` allowlist or defaults all-scope admins to Fuxing.
  - Business recovery banners resolve branch names from the PostgreSQL-backed site registry instead of a static `SITE_LABELS` map.
  - Device profile sync no longer falls back missing non-admin locations to Fuxing; missing scope fails closed and arbitrary server-assigned site codes are preserved.
- No schema migration and no production data rewrite.
- NEXT: exact-head CI/deploy, then continue auditing source-coded operational Work Area/task/SOP defaults separately from database inventory authority.

## ACTIVE — business-state dynamic site registry, 2026-09-29

- Verified production baseline before this candidate: PR #173 merged as `0696efeb550e9aeac17b5b05170ba0f2fd465025`; Deploy #1004 / run `36459634291` attempt 2 PASS; schema remains `029`; backup `kitchen_os_20260928T175029Z.dump`; production UI smoke PASS; Inventory Site Audit #279 PASS.
- PR #173 removed the closed `central / fuxing / yongji` list from Workforce attendance/payroll and Schedule Rules; both now follow the database-backed active inventory site.
- Current branch: `refactor/business-state-site-registry-20260929`.
- Remaining defect found by the next hard-code audit: `business-state-sync.js` still accepted only Central/Fuxing/Yongji and silently defaulted all-scope admins to Fuxing.
- Candidate removes that closed list, lets any server-assigned/database-declared site use the same guarded persistence path, and makes the Inventory site registry initialize/correct the all-scope active site from active PostgreSQL sites.
- Inactive database sites are excluded from operational default-site selection.
- Regression includes an arbitrary future site code (`branch-new`) to prove business-state save-before-switch no longer requires a frontend code change.
- No schema migration, permission change or business/inventory data rewrite.
- NEXT: exact-head CI, then merge/deploy and rerun production Inventory Site Audit before continuing the remaining hard-code audit.

## DONE — branch inventory count parity + Work Area invariant, 2026-09-29

- PR #170 merged as `2fc31adba5c2f11e61915b4f2d428ea4bfbb6d62`, moving replenishment/factory-vs-internal routing into PostgreSQL storage metadata (`replenishment_policy=internal|factory`) and Super Admin instead of runtime warehouse-name assumptions.
- Deploy #1000 / run `36452810695` passed full regression, backup/deploy, `DATA_INTEGRITY_OK`, health and production UI smoke on schema `028`.
- Post-deploy Audit #272 correctly found one remaining Central↔branch Work Area drift: Yongji `川麻湯包` was `soup` while the unique active Central catalog authority was `noodles`.
- PR #171 merged as `5b932369be9e9fa449bbef12a16f35eb7bbfcc43`; schema `029` transactionally repaired the drift without changing total Work Area quantity, preserves the larger minimum, writes a system audit row, and adds a PostgreSQL guard so shared Central/branch catalog Work Areas cannot silently diverge again.
- Deploy #1002 / run `36455428140` PASS. Backup: `kitchen_os_20260928T170927Z.dump`; runtime `release=5b93236`, schema `029`; `DATA_INTEGRITY_OK`; Web/API/Super Admin healthy; production UI smoke PASS.
- Inventory Site Production Audit #275 / run `36456386470` PASS:
  - Central: 41 active products = noodles 38 / soup 1 / seafood 2;
  - Fuxing: 78 active products = noodles 30 / soup 18 / seafood 21 / meat 9;
  - Yongji: 75 active products = noodles 33 / soup 17 / seafood 17 / meat 8;
  - each branch Work Area sum now exactly equals its active product total;
  - `active_branch_item_without_work_row=0`, `work_stock_area_mismatch=0`, `catalog_work_area_mismatch_with_central=0`;
  - Fuxing/Yongji legacy manifests both expected 75 / missing 0;
  - site-isolation, location classification, legacy-materialization and hidden-inventory violation counts all 0.
- Fuxing having 78 while Yongji has 75 is not the old Storage-vs-Work-Area bug: both contain the complete 75-item legacy manifest, while Fuxing currently has three additional active catalog identities. Do not force the two branches to have identical totals unless business requirements explicitly say those three Fuxing-only items must also exist at Yongji.
- NEXT: continue remaining hard-code audit only where a business rule is still source-coded; keep PostgreSQL storage/work-area/replenishment policy as the runtime authority.

## DONE — DB-authoritative Work Area / inventory defaults / frontend permissions, 2026-09-28

- PR #169 merged as `53a5cc2f5f8088b1eb602b21330066ae51093c2a`; production Deploy #986 / run `36398702734` completed successfully after an unchanged rerun of one transient full-device admin-mobile timeout.
- Work Area inference by product name is removed. Missing Work Area data stays unconfigured; no Chinese/Vietnamese label parsing and no implicit `noodles` fallback.
- Browser inventory defaults/master lists were removed from `store-core.js`: no `DEFAULT_ITEMS`, `LARGE_FREEZER_SHEET_ITEMS`, `STOCK_KEYS`, `WORK_AREAS`, `ZONES` or `PRIMARY_ZONES`.
- New browser state starts with empty inventory/work stock until PostgreSQL hydration. Storage rows no longer synthesize Work Area stock.
- Schema 027 is the historical legacy branch-catalog authority; its 75 canonical identities remain regression-verified.
- Frontend permissions are fail-closed for all non-admin accounts. Explicit authenticated DB/session permissions are the only grants; source-coded `ACCOUNT_ROLE_DEFAULTS` and staff `ROLE_PERMISSIONS` no longer grant capabilities.
- SOP/Skills/Attendance/Schedule/Task action guards use authenticated account permissions instead of staff role names.
- Exact PR head `496eb6a49b29fe51d7f78121b5a81dc0912a154b` passed Super Admin Browser #247, Workforce Approval #372, Workforce Schedule Rules #154 and Deploy #985.
- Production backup: `kitchen_os_20260928T085014Z.dump`; health `release=53a5cc2`, schema `027`, app/database `ok`; `DATA_INTEGRITY_OK`; production UI smoke PASS.
- No migration and no production stock rewrite.
- NEXT: migrate procurement/factory business rules in `rules-core.js` away from remaining legacy warehouse assumptions.

## DONE — branch catalog + Work Area projection production verification, 2026-09-28

- PR #167 merged as `7ae8d3fcbff9ceb9e3ddb1171985728a01b9b0c7`; Deploy #981 / run `36344197565` passed preflight, PostgreSQL/API/Super Admin/browser/full-device regression, deploy, health/release check and production UI smoke.
- Production schema is `027`; release is `7ae8d3f`.
- Root cause of the UI mismatch was missing branch Work Location stock projections, not incorrect `inventory_items.work_area` classification.
- Migration 027 materialized 75 legacy branch catalog identities into PostgreSQL and backfilled missing Work Location rows without overwriting existing quantity/minimum.
- PostgreSQL trigger now keeps every active branch product projected to exactly one matching Work Area after future catalog edits.
- Storage summary counts unique product identity instead of counting the same product once per storage location.
- Super Admin Integrity now reports products missing Work Area projection and its direct PostgreSQL/API round-trip is regression-tested.
- Production audit #252 / run `36345117340` PASS:
  - Fuxing 78 active products: noodles 30 / soup 18 / seafood 21 / meat 9;
  - Yongji 75 active products: noodles 33 / soup 17 / seafood 17 / meat 8;
  - Central 41 active products: noodles 38 / soup 1 / seafood 2;
  - `active_branch_item_without_work_row=0`;
  - Fuxing legacy manifest expected 75 / missing 0;
  - Yongji legacy manifest expected 75 / missing 0;
  - site/classification/materialization/hidden-inventory violation counts all 0.
- Next: procurement/factory hard-code and legacy `store-core.js` defaults are separate cleanup work; do not remove them until their remaining consumers are audited.

## DONE — database-driven inventory replenishment routing, 2026-09-28

- PR #164 merged as `e1d26b2cbc80cfb9b39fc24e7aafbdbdbebecb71`; Deploy #959 / run `36336697537` is verified in production.
- Replenishment routing now uses PostgreSQL `storage_group=primary|service` plus storage `sort_order`; legacy storage IDs are no longer routing rules.
- Exact head `b3d66d2d4407dfd55df182ed113754814c9401eb` passed Super Admin Browser #222, Workforce #347 and Deploy #958.
- Merge run #959 had one unrelated mobile-admin timeout on the first full-device attempt; failed-job rerun passed before deployment.
- Backup: `kitchen_os_20260927T173001Z.dump`; health `release=e1d26b2`, schema `026`, app/database `ok`; `DATA_INTEGRITY_OK`; production UI smoke PASS; Inventory Site Audit #228 PASS.
- Stale PR #161 closed as superseded.
- NEXT: migrate procurement/factory warehouse rules away from `large-freezer` and then retire legacy store inventory defaults separately.

## DONE — Fuxing/Yongji catalog work-area normalization, 2026-09-28

- PR #162 merged as `22383cdbd8828f1d1934ffdc77925b9220ebf3d3`; Deploy #957 / run `36335664061` is verified in production.
- PostgreSQL schema is now `026`.
- Legacy branch item `work_area` drift is normalized from the active Central item with the same stable `catalog_key`; no label heuristic and no fixed site-name list.
- Existing work stock is moved transactionally to the corrected Work Location without changing total quantity.
- Pre-deploy: Central↔branch catalog mismatch 16. Post-deploy audit #225: mismatch 0, work-stock mismatch 0, location classification violations 0, hidden violations 0.
- Final item counts: Central 41; Fuxing 76 (28 noodles / 18 soup / 21 seafood / 9 meat); Yongji 72 (31 noodles / 16 soup / 17 seafood / 8 meat).
- Backup: `kitchen_os_20260927T171034Z.dump`; health `release=22383cd`, schema `026`, app/database `ok`; production UI smoke PASS.
- NEXT: remove remaining replenishment routing tied to legacy storage IDs by using PostgreSQL `storage_group` + sort order.

## DONE — unified inventory location/work-area classification, 2026-09-27

- PR #159 merged as `fb7c27cc64963c238ff2b86b999dac2f818f3507`; Deploy #948 / run `36329813136` is verified in production.
- PostgreSQL schema is now `025`.
- Central/Fuxing/Yongji share one inventory structure: storage = explicit `primary|service`; Work Area = master row + exactly one synchronized active Work Location.
- Central generic `使用中 / central-work-use` is retired; Central Work view shows the actual database Work Area.
- Central storage UI now separates Kho tổng/primary and Kho khu vực/service, matching Fuxing/Yongji.
- Fuxing/Yongji require explicit service classification; invalid/unknown storage groups are not silently accepted as service.
- Work Area owns Work Location lifecycle; direct work-location mutations are blocked.
- Pre-deploy production audit: classification violations 7, work-stock mismatch 2.
- Post-deploy audit #215: classification violations 0, work-stock mismatch 0, hidden inventory violations 0, site mismatch 0.
- Production totals preserved after normalization: Central 81, Fuxing 1805, Yongji 17.
- Exact head `0ed9a401ee74de3b48dfc8e74a183f05d6e0adc8` passed Schema #236, Master Data/Admin #285, Super Admin Browser #213, Workforce Approval #338, Load #504 and Deploy #947.
- Production #948 passed full regression, backup/deploy, `DATA_INTEGRITY_OK`, health `release=fb7c27c` / schema `025`, and `PRODUCTION_UI_SMOKE_OK`.
- Backup: `kitchen_os_20260927T153508Z.dump`.
- NEXT: audit remaining non-structural restaurant hard-code separately; inventory structure stays DB-driven.

## ACTIVE — Central storage-row pick shortcut, 2026-09-27

- Branch: `feat/central-storage-pick-shortcut-20260927`.
- Positive-stock Central storage rows can deep-link into 領貨 with exact database item/source focus.
- Shared operation controller remains the only write UI; VPS API/PostgreSQL remain authoritative.
- No schema, endpoint, permission or production stock changes.
- Candidate until exact-head regression + merge + production deploy/smoke pass.


## DONE — Central priority receive shortcut, 2026-09-27

- PR #156 merged as `07d42a30eab8932507c3ccdd54f92f6a8f69a853`; Deploy #903 / run `36301227833` is verified in production.
- Central low-stock rows now provide a per-item 進貨 shortcut that focuses the exact database item and shortage location in the shared operation controller.
- Manual search exits the deep-link focus; normal generic operation behavior remains unchanged.
- Exact PR head `bdbaffcb737a8d5350a26ff9fd51babb3bbad66b` passed Deploy #902, Super Admin Browser #170 and Workforce Approval #295.
- Production #903 passed full regression, backup/deploy, `DATA_INTEGRITY_OK`, health `release=07d42a3` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`.
- Backup: `kitchen_os_20260927T065418Z.dump`.
- No schema, endpoint, permission or stock rewrite.
- NEXT: apply the same database-keyed low-friction pattern to 領貨 / 轉撥 / 出貨 where it materially reduces operator steps.

## DONE — Central Kitchen operator priority workspace, 2026-09-27

- PR #154 merged as `26bfd49c6f5ba7586dcc2bdc411569f69d14acd2`; Deploy #900 / run `36291179320` is verified in production.
- Central Overview now contains a database-driven `待處理 / Cần xử lý` panel for stock rows below configured minimum.
- Quantities remain per item/unit; there is no mixed-unit aggregation.
- Alert rows use PostgreSQL-loaded storage labels and drill into the exact storage filter.
- Healthy state and 進貨入庫 quick action follow current data, permission and cloud readiness.
- Exact PR head `5667b411b63190acae7cc7b5a23c32db5e0b5309` passed Deploy #899, Super Admin Browser #168 and Workforce Approval #293.
- Production #900 passed full regression, backup/deploy, `DATA_INTEGRITY_OK`, health `release=26bfd49` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`.
- Backup: `kitchen_os_20260927T032703Z.dump`.
- Inventory Site Production Audit #166 and post-deploy workforce verification all PASS.
- No schema migration, permission change, endpoint change or stock rewrite.
- NEXT: continue Central daily-operation UX refinement on database-declared master data.

## DONE — Central Kitchen inventory UI redesign, 2026-09-27

- PR #152 merged as `7157d0b5263209b3391ccab57c088668d7902973`; Deploy #898 / run `36287068079` is verified in production.
- Central now has a dedicated responsive inventory shell with database-derived site identity, storage/work-area structure and four meaningful KPIs.
- Overview / 入庫 / 領貨 / 轉撥 / 出貨 / 管理 / 紀錄 remain backed by the existing VPS API/PostgreSQL inventory authority.
- CI caught and fixed legacy `.central-heading` lifecycle guards that could rerender the redesigned shell and erase dirty Central editor state. All Central/branch render guards now key off `[data-central-kitchen-shell]`.
- Super Admin peer edits preserve unsaved Central drafts and surface the stale-edit warning instead of overwriting the form.
- Exact PR head `df64c415950acccb3741cc43e75052710a1c3618` passed Deploy #897 and Super Admin Browser #167 plus workforce diagnostics.
- Production #898 passed full regression, backup/deploy, `DATA_INTEGRITY_OK`, health `release=7157d0b` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`.
- Backup: `kitchen_os_20260927T020142Z.dump`.
- No schema migration, permission change, endpoint change or stock rewrite.
- NEXT: continue Central Kitchen operator-UI refinement on database-declared master data; keep backend/frontend free of mutable restaurant hard-code.

## DONE — inventory UI master-data cutover, 2026-09-27

- PR #150 merged as `b1447b727e310b7a3095f5782c0a933916ef6234`; Deploy #885 / run `36270568342` is verified in production.
- Branch/Central inventory storage groups, work areas, primary/service grouping, location labels, site labels and item-unit entry are driven by PostgreSQL-loaded master data.
- Branch runtime inventory cannot fall back to source-seeded stock.
- Fixed Central unit/work-area/location defaults and remaining branch/site label fallbacks were removed from inventory UI paths.
- Mobile Settings accepts long database-provided site names without clipping.
- Exact PR head `b588b6673af3b0ec9dacc012dc59f06e77fc6ec0` passed Deploy #884, Super Admin Browser #155 and Workforce #280.
- Production #885 passed backup/deploy, `DATA_INTEGRITY_OK`, health `release=b1447b7` / schema `024`, and production UI smoke. Backup: `kitchen_os_20260926T204907Z.dump`.
- No schema migration and no production stock rewrite.
- NEXT: redesign Central Kitchen (央廚) inventory UI on the database-declared model.

## DONE — PostgreSQL-only inventory runtime authority, 2026-09-27

- PR #148 merged as `d88a90d9487d8edbb5f7e8020397893a5a5e9849`; Deploy #872 / run `36265842924` is verified in production.
- Removed branch/Central browser-local writable inventory drafts, local operation history, Central hard-coded product seed, fallback-success paths, `canInventoryDraftCount`, and the draft operation controller.
- Browser inventory caches now remain read-only server projections only; failed writes reconcile from PostgreSQL.
- Empty PostgreSQL snapshots remain authoritative and cannot trigger a hard-coded catalog reseed.
- Warehouse/site switching is driven by the PostgreSQL-backed site registry.
- Exact PR head `95d9ce407f27a96240fcc261b15671a8f1a77e43` passed preflight/full regression #871 and Workforce #268; merge production #872 passed backup/deploy, `DATA_INTEGRITY_OK`, health `release=d88a90d` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`.
- Backup: `kitchen_os_20260926T192740Z.dump`.
- No schema migration and no production stock rewrite.
- NEXT: retire remaining mutable inventory master/rule hard-codes, then redesign Central Kitchen UI.

## DONE — realtime Database site registry, 2026-09-27

- PR #146 merged as `95a39088a33f61c218412c1dd2e2d253306a0471`; Deploy #867 / run `36262880282` is verified in production.
- Super Admin site create/update emits authenticated `site-registry` SSE invalidation; already-open Website and Super Admin sessions re-read the PostgreSQL registry without manual reload.
- Site registry cache is scoped to the authenticated user and ignores stale responses from a previous login.
- Inventory branch logic uses database-declared `inventory_mode`; the remaining Fuxing/Yongji closed lists in the inventory page were removed.
- Dirty/pending Super Admin Database editors defer active-site replacement, preventing old-site snapshots from being shown under a new site.
- Unrelated site-registry edits do not force an unnecessary active-stock reload.
- Exact PR head `eedaaca8244e880152d5273bccb71bd1e231b4f9` passed Master Data/Admin #242, Load #461, Workforce #264, Super Admin Browser #139 and Deploy preflight/full regression #866.
- Production #867 passed backup/deploy, `DATA_INTEGRITY_OK`, health `release=95a3908` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`. Backup: `kitchen_os_20260926T183652Z.dump`.
- No schema migration and no production stock rewrite.
- NEXT: retire obsolete local inventory mutation/draft compatibility paths while preserving safe read-only cache/recovery behavior, then redesign Central Kitchen UI.


## DONE — Database control plane / inventory hard-code retirement stage 1

- PR #144 merged as `15ba0013f15daa9dcdc04152c95f12bd9f7fc793` and is verified in production through Deploy #856 / run `36259731875`.
- Super Admin is now formally defined as the normal business Database control plane; PostgreSQL remains authoritative behind VPS APIs.
- Legacy inventory helper paths derive site/storage/work structure from PostgreSQL-loaded master data instead of closed Central/Fuxing/Yongji and fixed Central-location mappings.
- Pre-merge Master Data/Admin Panel, six-profile Super Admin Browser and workforce diagnostics passed; merge release passed preflight, database/API round-trip, PostgreSQL concurrency, desktop/mobile + full-device browser regression, backup/rollback deploy, production health/release and production UI smoke.
- Schema remains `024`; no production stock rewrite or schema migration.
- Next inventory stage: real-time site-registry propagation, retire more obsolete local draft/master-data compatibility paths, then redesign Central Kitchen UI on database-declared structure.

## Role/location correction — production 2026-09-25

- PR #140 fixed `INVALID_LOCATION` when changing an all-scope user to an assigned branch Role. The workplace choices now follow Role scope; custom permissions and the selected branch survive switching. The isolated six-device UI and PostgreSQL account round-trip passed.
- Deploy #847 was blocked before frontend activation by an obsolete audit of legacy permission JSON. PR #141 updated the verifier to check effective database Role plus overrides without changing production accounts.
- **Verified production:** `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`, Deploy #849 / run `36153187681`. Full regression, corrected `DATA_INTEGRITY_OK`, backup, health (`release=f2ea2b3`, `schema=024`, app/database `ok`) and `PRODUCTION_UI_SMOKE_OK` all passed. Backup: `kitchen_os_20260925T152227Z.dump`.


## Production correction — 2026-09-25

- PR #139 merged as `ee5316b8ae5f12f2288aebf54e9e9cede3756ba0`; VPS deploy #843 / run `36142844487` passed complete regression, backup/deploy and production UI smoke. Runtime: `release=ee5316b`, PostgreSQL schema `024`, app/database `ok`.
- Main inventory and Super Admin now reconcile site-specific work areas, storage and ingredient/stock metadata for Central, Fuxing and Yongji through PostgreSQL. Clean editors accept remote changes; dirty drafts retain input and block stale submission. The branch editor sends its actual form values, and Central overview Edit opens correctly.
- Six-device Super Admin browser regression `36142056162` and full API/PostgreSQL/browser regression `36142055831` passed; the merged release passed regression and production smoke in `36142844487`. No schema migration or production data rewrite.

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #900 / run `36291179320`.
- Verified production SHA: `26bfd49c6f5ba7586dcc2bdc411569f69d14acd2`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #937: PASS (PR #138 source).
- Deploy-integrated inventory site/data-integrity audit: PASS.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item/location lifecycle and site-integrity hardening.
- Catalog sync removed from quantity/minimum authority.
- Minimum changes are transactional and visible in Inventory History.
- Receive-default create/update/delete are durably audited.
- No-op receive-default saves/deletes create no audit.
- Live GitHub & Handoff deployed.
- Inventory catalog/work/storage/modal round-trip and rapid `+ / -` performance fix (PR #132) deployed.
- Inventory overview/editor writes persist with explicit `inventory.edit` + site scope and synchronize through authenticated SSE (PR #133).
- Central/Fuxing/Yongji two-tab database round-trip and peer-editor repaint regression: PASS.
- Production #823 verified on schema 024.
- Schedule Parity #105 / `35571899839` and Schedule Backfill verify #316 / `35571899835` both passed against exact release `30fd1dd`.

## DONE — branch-scoped Super Admin inventory database

Branch:

- PR #138 merged into `main` as `5cc4f907387873367d78dfbdfb3183971846e968`;
- production deployment #832 passed on that exact release.

Schema:

- remains `024`.

Five views: ingredients, locations/work areas, per-location quantities/minimums, movement history and integrity. All writes use existing business APIs; the UI preserves per-site layouts, metadata and archive guards. Optional revision/expected-value checks reject stale saves; append-only association saves cannot prune other locations. Master-data writes now publish inventory SSE invalidations. No migration or new database authority.

Local static/performance/Super Admin contracts, API/PostgreSQL round trips on all three sites, six-profile browser tests, peer-edit conflict/input retention, full-system regression and production UI smoke passed. Runs: Super Admin Browser `35671898006`, Master Data/Admin API `35671897948`, final production `35672333632`. Runtime health returned release `5cc4f90`, schema `024`, app/database `ok`; inventory isolation audit found zero violations. Cloud Browser local preview was blocked; automated CI screenshots provide device evidence.

## NEXT

1. Owner can configure each branch's work areas and storage independently through Super Admin → Database; no setup values were copied automatically.
2. Preserve transactional relocation, expected-value conflict checks and PostgreSQL authority in follow-up work.
3. Refresh the static development-status fallback wording during the next runtime change; live release/workflow evidence and CURRENT_HANDOFF already record completion.
4. Preserve the existing schedule read flag and compatibility writes; this inventory UI stage does not alter that domain.

## BLOCKED

- No production data blocker.
- Production load/stress testing, deeper per-record business concurrency and literal physical-device certification remain approval/operational-setup items in `docs/PENDING_APPROVAL.md`.
