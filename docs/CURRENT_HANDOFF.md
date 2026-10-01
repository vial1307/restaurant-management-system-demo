# Kitchen OS — Current Development Handoff

## CURRENT VERIFIED PRODUCTION — Inventory compact Pick row + overflow hardening, 2026-10-02

This is the current Inventory UI continuation authority on schema 031.

Production:
- PR #186 merged as `337f5a2f6a3b0bfa06916fede0b0336cee4018e2`;
- exact PR head `abd0276abc3009ed98375b7fcf49f8ccc6beb903` passed preflight, Desktop/mobile Chromium and full-device cross-browser regression;
- Deploy Kitchen OS to VPS #1078 / run `36904751345`: PASS;
- GitHub Pages #996 / run `36904748812`: PASS;
- production health: `{"app":"ok","database":"ok","schema":"031","release":"337f5a2"}`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: `PRODUCTION_UI_SMOKE_OK`;
- Inventory Site Production Audit #368 / run `36906762392`: PASS.

UI behavior now verified:
- wide Desktop Pick follow-up compacts existing 已領貨 / 使用 / 歸位 controls into one horizontal sequence when enough width exists;
- 901–1199px uses a responsive Pick fallback; mobile keeps the existing wrapped/touch-friendly layout;
- operation cards no longer inherit the legacy `240px + 320px + auto` internal minimum grid that caused half-width 入庫/出貨 overflow;
- 761–1100px Inventory stock/work tables use responsive cards rather than the legacy 945px minimum table width;
- long bilingual text, buttons, badges, source pills and labels are width-contained and wrap safely;
- selects remain bounded with ellipsis;
- Central Kitchen Inventory surfaces use the same overflow contract;
- one presentation-only guard in `src/search-i18n-layer.js` avoids bilingualizing labels already structured by `ui-refresh.js`, preventing duplicated Chinese text in compact controls.

Regression findings that are now permanently covered:
- first overflow guard caught a real 51px overflow in 入庫 cards caused by legacy internal operation-card minimums;
- the next run caught a real 214px overflow at 844×390 caused by the legacy 945px Inventory table minimum;
- both defects were fixed in presentation CSS, and final exact-head Chromium/full-device regression passed;
- `tests/browser-regression.mjs` now checks document/card/row/button horizontal overflow, dense Pick/Transfer full width, wide-Desktop Pick ordering and duplicate structured bilingual labels.

Strict scope:
1. No Inventory business handler or operation semantics were rewritten.
2. No API/backend, PostgreSQL/schema, RBAC/permissions, quantity/minimum, Work Area/storage, transfer/shipping or master-data authority changed.
3. Runtime layout/overflow work remains in `src/inventory-maestro-ui.css`; the only runtime JavaScript change is the presentation-only duplicate-label guard above.
4. PostgreSQL/VPS remains the sole Inventory data authority.

Latest production Inventory audit:
- Central: 41 active items / quantity 81;
- Fuxing: 78 active items / quantity 1823;
- Yongji: 75 active items / quantity 17;
- inventory site integrity violations: 0;
- location classification violations: 0;
- branch legacy catalog materialization violations: 0;
- hidden integrity violations: 0;
- Fuxing/Yongji 75-item manifests: missing 0;
- `cross_site_work_area_variants=8` remains informational under site-scoped schema 031.

Continuation runtime baseline: `337f5a2f6a3b0bfa06916fede0b0336cee4018e2` / schema 031.

## CLOSED CANDIDATE HISTORY — Inventory compact Pick row + global overflow hardening, 2026-10-02

Verified production runtime baseline remains `53d218cf11b9cb1f10ceab586c402f531ff112d5` / schema 031. Documentation-only main head may be newer.

Candidate branch: `style/inventory-overflow-density-20261002`.

Scope:
- presentation-only runtime work is concentrated in `src/inventory-maestro-ui.css`; one UI-only i18n guard in `src/search-i18n-layer.js` prevents already-structured bilingual labels from being translated a second time;
- wide Desktop Pick follow-up compacts existing 已領貨 / 使用 / 歸位 controls into one row when enough width exists;
- smaller Desktop/tablet/mobile retain responsive multi-row fallbacks instead of squeezing controls;
- Inventory-wide overflow hardening covers operation cards, stock/work rows, tabs, buttons, labels, select controls, source pills, status badges and Central Kitchen panels;
- long bilingual labels wrap safely; selects remain bounded and use ellipsis rather than protruding from cards;
- no Inventory business handler, API/backend, PostgreSQL/schema, RBAC/permissions, quantity/minimum, Work Area/storage, transfer/shipping or master-data authority changes.

Regression:
- `tests/browser-regression.mjs` now checks document/card/row/button horizontal overflow on Inventory surfaces;
- wide Desktop Pick geometry asserts status → Use → Return remain horizontally ordered in one compact row;
- responsive regression also rejects duplicate bilingual primary labels and reports exact overflowing controls/descendants.
- exact-head CI/full-device regression is required before merge/deploy.

Do not record this candidate as production until merge, VPS deploy, release health, `DATA_INTEGRITY_OK`, production UI smoke and Inventory Site Production Audit all pass.

## CURRENT VERIFIED PRODUCTION — Inventory responsive UI + Desktop 領貨 / 轉撥 repair, 2026-10-02

This section is the current UI/Inventory continuation authority on schema 031.

Production:
- PR #184 merged to `main` as `53d218cf11b9cb1f10ceab586c402f531ff112d5`;
- Deploy Kitchen OS to VPS #1062 / run `36896045707`: PASS;
- GitHub Pages #994 / run `36896043714`: PASS;
- production health: `{"app":"ok","database":"ok","schema":"031","release":"53d218c"}`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: `PRODUCTION_UI_SMOKE_OK`;
- Inventory Site Production Audit #350 / run `36896923185`: PASS.

Desktop repair:
- user-reported 領貨 (pick) and 轉撥 (transfer) cards were being compressed into the two-column Desktop operation grid after responsive Phase 3;
- repair remains presentation-only in `src/inventory-maestro-ui.css`;
- cards already containing `.pick-followup` or `.op-transfer-balance` span the full Desktop operation grid;
- transfer source → destination balance uses a stable three-column layout;
- pick return destination / quantity / action controls receive sufficient width and wrapping;
- existing DOM, handlers, API calls and database-backed values are reused unchanged.

Regression protection:
- `tests/browser-regression.mjs` now checks Desktop pick/transfer dense cards when present;
- the guard requires the dense card to span the operation-list width and rejects horizontal overflow;
- exact PR head `1f987b923f403e6af8744b7d3bba7ea117c3238b` passed Deploy #1061 on attempt 2;
- attempt 1 failed only on a transient WebKit mobile CORS/page-error for `/api/inventory/fuxing`; the same unchanged head passed on rerun;
- merge production regression, deploy and production smoke all passed.

Scope remains strict:
1. No Inventory JavaScript business handler was rewritten for this repair.
2. No API/backend, PostgreSQL/schema, RBAC/permission, quantity/minimum, Work Area/storage, transfer/shipping or master-data authority changed.
3. UI work should continue in `src/inventory-maestro-ui.css` wherever possible; do not hard-code product/site/role/business data to solve visual issues.
4. PostgreSQL/VPS remains the sole runtime authority for Inventory data and configuration.

Latest production Inventory audit:
- Central: 41 active items / quantity 81;
- Fuxing: 78 active items / quantity 1823;
- Yongji: 75 active items / quantity 17;
- inventory site integrity violations: 0;
- location classification violations: 0;
- branch legacy catalog materialization violations: 0;
- hidden integrity violations: 0;
- Fuxing/Yongji 75-item historical manifests: missing 0;
- `cross_site_work_area_variants=8` is informational and valid under site-scoped schema 031.

Continuation baseline: `53d218cf11b9cb1f10ceab586c402f531ff112d5` / schema 031.

## CLOSED REPAIR HISTORY — Desktop 領貨 / 轉撥 UI, 2026-10-02

Responsive UI Phase 3 was merged in PR #183 as `52a1344cd9f1eafec372c15feffb85660d384b4b`, but deploy #1058 failed and that merge commit is not a verified production release.

Current repair branch: `fix/inventory-desktop-pick-transfer-20261002`.

Repair scope:
- CSS-only in `src/inventory-maestro-ui.css`;
- 領貨 and 轉撥 cards use full-width Desktop rows because these flows contain denser nested controls than receive/ship;
- existing DOM/handlers/data are reused through presentation selectors;
- no JavaScript, API/backend, PostgreSQL/schema, RBAC, quantity/minimum, Work Area/storage or movement semantics change.

Do not record a new production SHA until the repair is merged, deploy is green, release health matches, and production smoke passes.

## CLOSED CANDIDATE HISTORY — Inventory responsive UI Phase 3, 2026-10-01

PR #183 (`style/inventory-responsive-polish-20261001`) continues the presentation-only inventory redesign from verified production `b7ffd9127987ca38e3c9dcfa79f56e3127bbc2de` / schema 031.

Candidate scope:
- runtime file changed: `src/inventory-maestro-ui.css` only;
- desktop workspace/readability polish;
- tablet operation-card breakpoint polish;
- mobile operation-tab grid, larger touch targets and safer wrapping;
- Central Kitchen mobile mode/location label readability;
- no handler, API, permission, PostgreSQL, schema, site/catalog, quantity/minimum, Work Area/storage, transfer/shipping or business-string rewrite.

Do not treat PR #183 as production until exact-head CI, merge, deploy, release health and production smoke all pass.

## CURRENT VERIFIED PRODUCTION — Inventory frontend redesign only, 2026-10-01

This is the current UI handoff on top of the unchanged schema-031 inventory runtime.

Production:
- first Inventory redesign PR #176 merged as `2c7ac057605c8b21c0297326ea16e1562e125832`;
- second visual polish PR #182 merged as `b7ffd9127987ca38e3c9dcfa79f56e3127bbc2de`;
- Deploy Kitchen OS to VPS #1055 / run `36803409583`: PASS;
- GitHub Pages #991 / run `36803408605`: PASS;
- pre-deploy backup: `kitchen_os_20261001T020103Z.dump`;
- production health: `{"app":"ok","database":"ok","schema":"031","release":"b7ffd91"}`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- Inventory Site Production Audit #340 / run `36803944820`: PASS.

Strict scope:
1. UI redesign is presentation-only.
2. Runtime business logic, event handlers, API/backend, PostgreSQL/schema, permissions/RBAC, site/catalog master data, quantities, minimums, Work Area rules, storage rules, transfer/shipping semantics and translation/business strings were not rewritten.
3. PR #176 added/loaded `src/inventory-maestro-ui.css`; PR #182 modifies only that CSS file.
4. Styling consumes classes already rendered by the existing inventory implementation; no product/site/role/business-data hard-code is introduced.
5. Existing Overview / 入庫 / 領貨 / 轉撥 / 出貨 / 管理 / 紀錄 functions remain the same handlers and database paths.

UI now covers:
- Inventory page shell, header, navigation tabs and operation guide;
- live KPI/status cards already supplied by current markup;
- storage and Work Area filters;
- search/filter bar;
- stock tables/cards and status badges;
- existing inbound/pick/transfer/ship operation cards;
- quantity/minimum/source-location/action controls;
- history/read-only states;
- desktop/tablet/mobile responsive presentation and visible keyboard focus.

Validation:
- static/preflight: PASS;
- site-scoped Work Area DB/API regressions: PASS;
- inventory mutation/RBAC regressions: PASS;
- Super Admin inventory round-trip: PASS;
- multi-user PostgreSQL concurrency: PASS;
- desktop/mobile Chromium: PASS;
- full-device cross-browser: PASS;
- production UI smoke: PASS.
- PR #182's first full-device attempt hit an unrelated Playwright navigation-context race in the mobile role/site certification; rerunning the same exact head passed without code changes.

Production inventory remains healthy after the UI deployment:
- Central: 41 active items / quantity 81;
- Fuxing: 78 active items / quantity 1793;
- Yongji: 75 active items / quantity 17;
- inventory site/location/materialization/hidden-integrity violation totals: 0;
- branch historical manifests: missing 0;
- `cross_site_work_area_variants=5` is informational under the site-scoped schema-031 model.

Continuation rule:
- continue Inventory visual work in `src/inventory-maestro-ui.css` wherever possible;
- do not change stable inventory functions merely to achieve a visual result;
- do not add frontend master-data or site/product/role hard-code;
- any requested functional behavior change must be handled separately from UI redesign.

## CURRENT VERIFIED PRODUCTION — schema 031 site-scoped Work Area, 2026-09-30

This section is the current authority. It supersedes the schema-029/030 assumption that one shared `catalog_key` must use the same Work Area across Central, Fuxing and Yongji.

Production baseline:
- PR #180 merged as `4ebd83f5aaccf094c354ee6798ae7e23a602b562`;
- Deploy Kitchen OS to VPS #1046 / run `36623939891`: PASS;
- pre-deploy backup: `kitchen_os_20260929T201202Z.dump`;
- production health: `{"app":"ok","database":"ok","schema":"031","release":"4ebd83f"}`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- Inventory Site Production Audit #330 / run `36624828753`: PASS.

Root cause of the repeated Work Area failure:
- schema 029/030 incorrectly used shared product identity (`catalog_key`) as an operational Work Area authority across every site;
- that forced a Fuxing Work Area edit to coordinate Central and Yongji too, even though each site has its own Work Area/storage configuration;
- the earlier stale-source and `storage_only` fixes were valid edge-case fixes, but they could not remove this incorrect global invariant;
- the handoff itself therefore contained the wrong invariant and was used to keep re-enforcing the failure.

Schema 031 / runtime authority:
1. `catalog_key` identifies the same product across sites; it does **not** define a global Work Area.
2. Work Area is site-owned PostgreSQL master data. Central, Fuxing, Yongji, and future branches may assign the same product to different Work Areas.
3. `/api/inventory/relocate-work-area` changes only the selected item's Work Area projection inside the selected site.
4. The endpoint validates the current source Work Area, current destination Work Location, permissions and live PostgreSQL state before mutation.
5. Quantity and minimum are preserved during the move.
6. Other sites are not updated implicitly. Cross-site quantity movement remains an explicit transfer/shipping operation.
7. PostgreSQL still rejects local Work stock whose site or Work Area does not match that item's declared site-local Work Area.
8. Super Admin shows cross-site Work Area differences as informational variants, not integrity errors.
9. Production audit reports cross-site variants informationally and only fails on real site-local integrity violations.

Production inventory after schema 031:
- Central: 41 active items / quantity 81; Work Areas 38 noodles / 1 soup / 2 seafood;
- Fuxing: 78 active items / quantity 1793; Work Areas 30 noodles / 18 soup / 21 seafood / 9 meat;
- Yongji: 75 active items / quantity 17; Work Areas 33 noodles / 17 soup / 17 seafood / 8 meat;
- `stock_site_mismatch=0`;
- `receive_default_site_mismatch=0`;
- `unknown_item_site=0`;
- `duplicate_active_catalog_site_groups=0`;
- `active_item_without_stock_rows=0`;
- `active_item_without_storage_rows=0`;
- `work_stock_area_mismatch=0`;
- Fuxing/Yongji 75-item historical manifests: missing 0;
- inventory site, location-classification, legacy-materialization and hidden-integrity violation totals: 0.
- `cross_site_work_area_variants=4` is informational and expected under the site-scoped model. Current examples include 和牛, 虎皮g腳包, 顆白菜 and 高麗菜 using different Work Areas between Fuxing/Yongji.

Regression proof:
- site-scoped DB regression: PASS;
- site-scoped Work Area API regression: PASS;
- changing Fuxing Work Area leaves Central/Yongji unchanged;
- storage-only branch products are covered;
- quantity/minimum preservation is asserted;
- direct metadata-only bypass and wrong Work Area stock remain rejected by PostgreSQL;
- full static, API/RBAC, Super Admin round-trip, concurrency, Chromium/mobile/full-device and production smoke regressions: PASS.

Continuation rules:
- never restore Central→branch Work Area canonicalization or cross-site Work Area parity as an integrity condition;
- never infer Work Area from product name/label or legacy frontend defaults;
- keep Work Area/storage/location configuration site-scoped and PostgreSQL-authoritative;
- cross-site stock movement must remain explicit through transfer/shipping flows;
- UI redesign remains separate from inventory mutation semantics.

## CURRENT VERIFIED PRODUCTION — storage_only shared Work Area fix, 2026-09-30

This supersedes the earlier stale-source note for the user-reported `CATALOG_ITEM_NOT_FOUND`.

Production baseline:
- PR #179 merged as `0839a587a91053671e0af7db41c5694eb84271c7`;
- Deploy Kitchen OS to VPS #1040 / run `36608174657`: PASS;
- pre-deploy backup: `kitchen_os_20260929T180340Z.dump`;
- production health: `{"app":"ok","database":"ok","schema":"030","release":"0839a58"}`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- Inventory Site Production Audit #322 / run `36609522960`: PASS.

Exact root cause fixed:
- legacy branch catalog migration 027 intentionally creates a Work Location projection for every active branch item with a Work Area, **including items whose historical `storage_only=true` flag is set**;
- schema 030 also enforces shared Central/branch Work Area parity independently of `storage_only`;
- however `/api/inventory/relocate-work-area` still built its shared-catalog coordination set using `sharedRows.filter(entry => !entry.storage_only)`;
- for products such as `川麻湯包 / Gói nước dùng mala Tứ Xuyên`, the selected Fuxing/Yongji row can be `storage_only=true`, so the item was removed from the relocation plan and the endpoint returned `CATALOG_ITEM_NOT_FOUND` even though the item existed.

Current invariant:
1. `storage_only` controls storage behavior only; it does not remove an active item's Work Area identity or Work Location projection.
2. Shared-catalog Work Area relocation coordinates every active Central/branch peer regardless of `storage_only`.
3. Quantity/minimum, permissions, audit logging and schema-030 atomicity remain unchanged.
4. Regression now uses storage-only branch peers and verifies the relocation endpoint returns 200 and preserves quantities/minimums.

Post-deploy inventory audit:
- Central: 41 items, quantity 81, Work Area = 38 noodles / 1 soup / 2 seafood;
- Fuxing: 78 items, quantity 1793, Work Area = 30 noodles / 18 soup / 21 seafood / 9 meat;
- Yongji: 75 items, quantity 17, Work Area = 33 noodles / 17 soup / 17 seafood / 8 meat;
- stock/site mismatch = 0;
- receive-default site mismatch = 0;
- duplicate active site/catalog groups = 0;
- active item without stock/storage rows = 0;
- work-stock Work Area mismatch = 0;
- catalog Work Area mismatch with Central = 0;
- Fuxing/Yongji 75-item manifests missing 0;
- all site/location/materialization/hidden-integrity violation totals = 0.

Continuation:
- if a Work Area edit fails after release `0839a58`, use the displayed exact error code; `CATALOG_ITEM_NOT_FOUND` for storage-only shared items is now covered by regression and fixed in production.
- keep UI redesign PR #176 isolated from runtime logic and rebase it onto this production baseline before merge.

## CURRENT VERIFIED PRODUCTION — stale Work Area source reconciliation, 2026-09-30

This supersedes the earlier schema-030 closure note for the user-reported Work Area edit alert.

Production baseline:
- PR #178 merged as `7d54cc9ac7a104711e37561d77b4045b8b3648ff`;
- Deploy Kitchen OS to VPS #1038 / run `36599511542`: PASS;
- pre-deploy backup: `kitchen_os_20260929T164701Z.dump`;
- production health: `{"app":"ok","database":"ok","schema":"030","release":"7d54cc9"}`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- Inventory Site Production Audit #319 / run `36600414378`: PASS.

Second-layer root cause fixed:
- schema 030/database atomicity was healthy, but the branch inventory page rendered the latest VPS snapshot while some edit handlers could resolve the same row from the selected historical service-date record;
- this allowed a stale previous Work Area/source location to be sent to `/api/inventory/relocate-work-area`, which PostgreSQL correctly rejected;
- `cloudRelocateWorkArea` also trusted the caller source location too much instead of first re-reading the item's current PostgreSQL classification.

Current invariant:
1. Branch catalog/Work Area mutations use the live VPS inventory snapshot, not the historical service-date record.
2. Before a Work Area mutation, the client force-refreshes the active site from PostgreSQL.
3. Source Work Location is derived from the item's current database `work_area`.
4. If another session already completed the requested move, the client treats it as an idempotent success and reconciles.
5. Any remaining Work Area failure now shows the exact backend error code in the alert instead of only the generic message.
6. Schema 030 remains unchanged and authoritative; no stock/minimum rewrite or new frontend master-data authority was introduced.

Post-deploy inventory audit remains clean:
- Central 41 items / quantity 81; Work Area 38 noodles / 1 soup / 2 seafood;
- Fuxing 78 items / quantity 1793; Work Area 30 noodles / 18 soup / 21 seafood / 9 meat;
- Yongji 75 items / quantity 17; Work Area 33 noodles / 17 soup / 17 seafood / 8 meat;
- `stock_site_mismatch=0`;
- `receive_default_site_mismatch=0`;
- `duplicate_active_catalog_site_groups=0`;
- `active_item_without_stock_rows=0`;
- `active_item_without_storage_rows=0`;
- `work_stock_area_mismatch=0`;
- `catalog_work_area_mismatch_with_central=0`;
- both 75-item branch manifests missing 0;
- site/location/materialization/hidden integrity violation totals all 0.

Continuation:
- if the user can reproduce a Work Area failure after release `7d54cc9`, capture the new displayed `Mã lỗi · 錯誤碼` exactly; the generic-only alert is no longer sufficient diagnostic evidence;
- keep UI redesign PR #176 separate from this runtime fix and rebase it onto this verified production baseline before merging.

## CURRENT VERIFIED PRODUCTION — schema 030 atomic shared-catalog Work Area, 2026-09-29

This section is the current authority for continuation; older ACTIVE sections below are retained as history.

Production baseline:
- PR #177 merged to `main` as release `6588ef8e77d454ef0ccf8c027685875074d1bd04`;
- Deploy Kitchen OS to VPS #1032 / run `36519526311`: PASS;
- pre-deploy backup: `kitchen_os_20260929T040434Z.dump`;
- production health: `{"app":"ok","database":"ok","schema":"030","release":"6588ef8"}`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin edge healthy;
- production UI smoke: `PRODUCTION_UI_SMOKE_OK`;
- Inventory Site Production Audit #313 / run `36520094299`: PASS.

Production inventory state after schema 030:
- Central: 41 active products; Work Area = 38 noodles / 1 soup / 2 seafood; quantity 81;
- Fuxing: 78 active products; Work Area = 30 noodles / 18 soup / 21 seafood / 9 meat; quantity 1793;
- Yongji: 75 active products; Work Area = 33 noodles / 17 soup / 17 seafood / 8 meat; quantity 17;
- `stock_site_mismatch=0`;
- `receive_default_site_mismatch=0`;
- `duplicate_active_catalog_site_groups=0`;
- `active_item_without_stock_rows=0`;
- `active_item_without_storage_rows=0`;
- `active_storage_invalid_group_or_policy=0`;
- `active_work_location_without_area=0`;
- `active_work_area_without_location=0`;
- `work_stock_area_mismatch=0`;
- `active_branch_item_without_work_row=0`;
- `catalog_work_area_mismatch_with_central=0`;
- Fuxing/Yongji historical branch manifests: expected 75 / missing 0;
- site, location-classification, legacy-materialization and hidden-inventory violation totals are all 0.

Schema 030 / API invariants now in force:
1. Shared Central + branch `catalog_key` Work Area parity is checked by a deferred PostgreSQL constraint at transaction COMMIT, allowing one legitimate coordinated multi-row move without permitting final drift.
2. `/api/inventory/relocate-work-area` resolves and locks every active shared-catalog peer, validates a matching active Work Location at every affected site, relocates each work projection, then updates all item classifications atomically.
3. PostgreSQL rejects Work stock whose site/Work Area does not match the active item's declared classification.
4. Active catalog identity is unique per site + `catalog_key`.
5. Catalog location writes fail closed for missing or cross-site location codes.
6. Storage relocation and cross-site destination-catalog creation are serialized to prevent concurrent mutation races.
7. Quantity/minimum remain dedicated stock authority; catalog metadata sync does not fabricate or overwrite physical stock values.
8. Peer Work Area changes are audit logged.

Regression coverage added/updated:
- shared-catalog Work Area API relocation across Central/Fuxing/Yongji;
- deferred DB guard accepts a fully coordinated transaction but rejects partial direct SQL drift;
- wrong-Work-Area stock rejection at the database boundary;
- invalid/cross-site catalog location fail-closed behavior;
- concurrent direct-transfer destination catalog creation;
- opposite-direction storage relocation serialization;
- schema-030 expectations across API, Super Admin, master-data and conflict wrappers.

Continuation rules:
- do not bypass inventory constraints with `session_replication_role`, disabled triggers, label/name heuristics, or frontend fallbacks;
- a shared catalog Work Area change must use the coordinated DB transaction path, never an independent one-site row update;
- do not force Fuxing and Yongji product totals to match: each site's own Storage/catalog ↔ Work Area parity is the invariant;
- PostgreSQL remains authority for sites, product identities, Work Areas, storage classification, replenishment policy, quantity/minimum and permissions;
- next work should continue the hard-code audit outside already-closed inventory authority or improve Super Admin inventory UX without reintroducing local master data.

## Active candidate — remaining runtime site hard-codes, 2026-09-29

Verified production baseline:
- release `77d3e13077a41d82d990704abe3dd3546d2f9b91`;
- Deploy #1006 / run `36466950388`, attempt 5: PASS;
- backup `kitchen_os_20260929T004244Z.dump`;
- schema `029`;
- `DATA_INTEGRITY_OK`;
- production UI smoke PASS;
- Inventory Site Production Audit #286 / run `36504554850`: PASS.

Production inventory integrity remains clean:
- Central: 41 products = 38 noodles / 1 soup / 2 seafood;
- Fuxing: 78 products = 30 noodles / 18 soup / 21 seafood / 9 meat;
- Yongji: 75 products = 33 noodles / 17 soup / 17 seafood / 8 meat;
- active item without stock/storage/work projection = 0;
- storage group/replenishment policy classification violations = 0;
- work-stock area mismatch = 0;
- Central↔branch shared catalog Work Area mismatch = 0;
- Fuxing/Yongji historical 75-item manifest missing = 0;
- hidden inventory violations = 0.

Current branch:
- `refactor/runtime-site-scope-cleanup-20260929`
- no schema migration.

Remaining site-authority defects being removed:
1. `business-persistence-status.js` still had `KNOWN_SITES = central/fuxing/yongji` and defaulted all-scope users to Fuxing.
2. `business-recovery-notice.js` still had a source-coded site label map for Central/Fuxing/Yongji.
3. `device-sync.js` still converted any missing non-admin site into Fuxing.

Candidate rules:
- any authenticated server-assigned site code is a valid scope candidate;
- all-scope status follows the shared active-site key already owned by the PostgreSQL-backed site registry;
- persistence events accept non-empty site codes instead of a closed frontend allowlist;
- recovery labels resolve through `inventorySite(code)` and refresh on `shitu:inventory-sites-changed`;
- missing server location is not guessed and therefore fails closed.

Do not reintroduce branch names as authorization/routing logic. Static translations may mention historical branch names only when they are literal copy/search aliases, not data authority.

## Active candidate — database-declared Business State site scope, 2026-09-29

Verified production baseline:
- release `0696efeb550e9aeac17b5b05170ba0f2fd465025`;
- Deploy Kitchen OS to VPS #1004 / run `36459634291`, attempt 2: PASS;
- backup `kitchen_os_20260928T175029Z.dump`;
- schema `029`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin healthy;
- production UI smoke PASS;
- Inventory Site Production Audit #279 / run `36461155597`: PASS.

The preceding PR #173 removed the closed Central/Fuxing/Yongji list from Workforce and Schedule Rules. Production audit #279 still confirms:
- Central 41 active products, Fuxing 78, Yongji 75;
- Work Area counts sum exactly to each site's active catalog;
- `stock_site_mismatch=0`;
- `active_storage_invalid_group_or_policy=0`;
- `work_stock_area_mismatch=0`;
- `active_branch_item_without_work_row=0`;
- `catalog_work_area_mismatch_with_central=0`;
- both 75-item branch legacy manifests missing 0;
- site/classification/materialization/hidden-integrity violation totals all 0.

Current branch:
- `refactor/business-state-site-registry-20260929`
- schema change: none.

Defect now being removed:
- `src/business-state-sync.js` still contained a browser-side allowlist of `central / fuxing / yongji`;
- an all-scope user with no valid saved site was silently forced to `fuxing`;
- a newly created database site could therefore be visible to the inventory switcher but blocked from shared Business State persistence until source code changed.

Candidate invariant:
1. server-assigned account site codes are accepted without a frontend physical-site allowlist;
2. all-scope Business State uses the same active-site key owned by the PostgreSQL-backed Inventory site registry;
3. the registry initializes or corrects that active site to the first active database site when the saved value is missing/inactive;
4. inactive sites can remain in administrative master data but cannot become an operational default;
5. warehouse switching still saves pending source-site Business State before changing scope;
6. regression proves an arbitrary future database site code can pass the same guarded switching flow.

Do not add another source-coded site list as a workaround. Site existence/activation remains PostgreSQL master data.

## Current production baseline — inventory parity closed on schema 029, 2026-09-29

Verified production release:
- merge/release SHA: `5b932369be9e9fa449bbef12a16f35eb7bbfcc43`;
- Deploy Kitchen OS to VPS #1002 / run `36455428140`: PASS;
- server backup: `kitchen_os_20260928T170927Z.dump`;
- PostgreSQL schema: `029`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin edge: healthy;
- production UI smoke: PASS;
- Inventory Site Production Audit #275 / run `36456386470`: PASS.

The user-reported branch Storage/Kho tổng vs Work Area count mismatch is now closed at the database/runtime level:
- Central: 41 active products; Work Area counts 38 noodles / 1 soup / 2 seafood = 41;
- Fuxing: 78 active products; Work Area counts 30 noodles / 18 soup / 21 seafood / 9 meat = 78;
- Yongji: 75 active products; Work Area counts 33 noodles / 17 soup / 17 seafood / 8 meat = 75;
- every active branch item has a matching Work Location row;
- work-stock classification drift = 0;
- Central↔branch shared-catalog Work Area drift = 0;
- Fuxing and Yongji both contain all 75 historical branch catalog identities (missing 0).

Important distinction: Fuxing total 78 and Yongji total 75 do not need to be numerically equal. Fuxing currently has three additional active catalog identities beyond the complete 75-item historical branch manifest. The invariant is that each site's Storage/catalog product set and Work Area projection agree, not that different branches must have identical product catalogs.

Latest integrity enforcement:
- schema 028 stores replenishment policy in PostgreSQL location metadata (`internal|factory`), removing factory-order routing dependence on mutable warehouse names/IDs;
- schema 029 repairs any existing shared-catalog Work Area drift transactionally and blocks future branch/Central divergence at the database boundary;
- API surfaces these invariant conflicts as HTTP 409;
- pre-deploy data verification and post-deploy Production Audit both enforce the same storage/work-area/replenishment classification.

Continuation rule:
1. Treat release `5b93236` / schema `029` as the verified production baseline.
2. Do not rewrite quantities/minimums merely to make branch product totals equal.
3. New shared catalog Work Area changes must be coordinated across Central and branches rather than bypassing schema 029.
4. Continue hard-code cleanup only where a remaining runtime business rule is still source-coded; PostgreSQL remains the authority for inventory sites, storage groups, work areas and replenishment policy.

## Completed release — DB-authoritative Work Area / inventory defaults / frontend permissions, 2026-09-28

PR #169 merged into `main` as `53a5cc2f5f8088b1eb602b21330066ae51093c2a` and is verified in production through Deploy Kitchen OS to VPS #986 / run `36398702734` (attempt 2).

This release completes the three cleanup items requested before continuing broader hard-code removal:

- **Work Area recognition by product name removed.**
  - `inferWorkArea()` is gone.
  - Browser hydration never parses Chinese/Vietnamese product labels to guess `noodles / soup / seafood / meat`.
  - If a row has no database Work Area, it remains unconfigured instead of silently defaulting to `noodles`.
  - Website/Management Work Area choices now come from the active site's PostgreSQL-loaded master data resolver.

- **Legacy Inventory defaults retired from runtime authority.**
  - `DEFAULT_ITEMS`, `LARGE_FREEZER_SHEET_ITEMS`, `STOCK_KEYS`, `WORK_AREAS`, `ZONES` and `PRIMARY_ZONES` were removed from `store-core.js`.
  - A new browser record starts with empty `inventory` / `workInventory` and waits for VPS/PostgreSQL hydration.
  - Browser storage rows can no longer synthesize Work Area stock; `buildWorkInventory()` intentionally returns an empty projection.
  - Historical branch catalog authority is now schema 027, not JavaScript constants. The schema-027 regression still verifies all 75 canonical legacy branch identities.

- **Frontend Role permission fallback removed.**
  - `ACCOUNT_ROLE_DEFAULTS` is removed from the frontend permission path and account editor.
  - Non-admin permissions are fail-closed unless the authenticated VPS/PostgreSQL session explicitly grants the module/action.
  - Legacy staff `ROLE_PERMISSIONS` no longer grants browser capabilities; compatibility `roleCan()` returns false.
  - Granular SOP / Skills / Attendance / Schedule / Task mutations now check the authenticated account permission projection instead of the local staff role name.
  - Admin remains the explicit full-access system role, consistent with the VPS permission normalizer.

Regression/contract updates:
- inventory hydration proves a name such as `海鮮牛肉湯` cannot infer a Work Area;
- explicit empty/missing Work Area stock remains empty rather than being synthesized;
- scalar/no-op inventory tests seed an explicit DB-shaped fixture instead of relying on retired defaults;
- legacy catalog materialization tests read the schema-027 manifest, not deleted browser constants;
- static gates reject reintroduction of source-coded inventory master data or frontend role grants.

Verification:
- exact PR head `496eb6a49b29fe51d7f78121b5a81dc0912a154b`: Super Admin Browser #247, Workforce Approval #372, Workforce Schedule Rules #154 and Deploy #985 all PASS;
- merge production run #986 first hit the known transient admin-mobile permission-state timeout in full-device certification; the unchanged failed-job rerun passed all PostgreSQL/API/concurrency/browser/full-device checks;
- deployment, release/health check and production UI smoke then PASS;
- backup: `kitchen_os_20260928T085014Z.dump`;
- production health: `release=53a5cc2`, schema `027`, app/database `ok`;
- `DATA_INTEGRITY_OK` and production permission-modal smoke PASS;
- no new database migration and no production stock rewrite.

Next hard-code cleanup is separate: procurement/factory business rules in `rules-core.js` still contain legacy warehouse assumptions and should be converted to database-defined policy/classification without reintroducing browser-side inventory authority.

## Completed release — branch catalog materialization + Work Area projection, 2026-09-28

PR #167 merged into `main` as `7ae8d3fcbff9ceb9e3ddb1171985728a01b9b0c7` and is verified in production through Deploy Kitchen OS to VPS #981 / run `36344197565`.

Root cause of the reported Storage vs Work Area count gap:
- branch Website hydration built `workInventory` only from PostgreSQL `inventory_stock` rows already attached to `kind='work'` locations;
- many legacy Fuxing/Yongji catalog items existed only in storage rows, so those products disappeared from 工作區 even though `inventory_items.work_area` was valid;
- Storage UI also counted storage-location rows, so one product stored in multiple locations could inflate the “all storage” number.

Schema 027 / runtime changes:
- materializes the remaining browser-era branch catalog into PostgreSQL: 75 canonical legacy item suffixes, with Fuxing/Yongji coverage verified by an audit manifest;
- creates only missing item/location associations and never overwrites existing physical quantity/minimum rows;
- every active branch item is projected into exactly one active Work Location matching `inventory_items.work_area`, including historical `storage_only` items;
- PostgreSQL trigger `inventory_items_sync_branch_work_projection` keeps that invariant for future Website/Super Admin/API edits;
- branch catalog API sync also attaches the database Work Location and preserves storage links on metadata-only edits;
- Website “all storage” and top item badges now count unique product identity instead of duplicate location rows;
- Super Admin Database Integrity reports `missingWorkStock` as “Nguyên liệu chưa được chiếu sang Khu làm việc / 食材尚未同步到工作區”;
- three-digit minimum values are no longer clipped in the inventory UI.

Production verification after deployment:
- release `7ae8d3f`, PostgreSQL schema `027`, production UI smoke PASS;
- Inventory Site Production Audit #252 / run `36345117340` PASS;
- Fuxing: 78 active products = noodles 30 / soup 18 / seafood 21 / meat 9;
- Yongji: 75 active products = noodles 33 / soup 17 / seafood 17 / meat 8;
- Central remains 41 products = noodles 38 / soup 1 / seafood 2;
- `active_branch_item_without_work_row=0`;
- legacy catalog manifest: Fuxing expected 75 / missing 0; Yongji expected 75 / missing 0;
- site-integrity violations 0, location/work-area classification violations 0, legacy-catalog materialization violations 0, hidden-inventory violations 0;
- deployed release verification: actual `7ae8d3f` = expected `7ae8d3f`.

Super Admin synchronization is verified:
- Database inventory reads directly from VPS/PostgreSQL endpoints;
- catalog/master-data writes use the authoritative inventory/master-data APIs;
- inventory SSE invalidation plus focus/poll fallback refreshes other open surfaces;
- Super Admin branch inventory database round-trip and Super Admin browser regression both PASS.

Next inventory hard-code cleanup remains separate: procurement/factory rules in `rules-core.js` and retirement of the now-non-authoritative legacy constants in `store-core.js` after all non-inventory/offline dependencies are proven safe.

## Completed release — database-driven inventory replenishment routing, 2026-09-28

PR #164 merged into `main` as `e1d26b2cbc80cfb9b39fc24e7aafbdbdbebecb71` and is verified in production through Deploy Kitchen OS to VPS #959 / run `36336697537`.

This release removes the remaining inventory replenishment source-routing dependency on legacy storage IDs:
- `inventoryUiGroups(site).storage` exposes PostgreSQL `storage_group` and `sort_order`;
- `inventorySources()` no longer contains `SOURCE_PRIORITY` or `large-fridge / large-freezer / four-door / kitchen` routing tables;
- Work Area replenishment uses database-classified storage and database sort order;
- service/Kho khu vực can source only from primary/Kho tổng storage;
- primary-storage replenishment remains inside primary storage;
- Website passes the active site's master-data storage groups into routing;
- regression uses arbitrary storage IDs, proving storage rename/addition does not require a frontend routing edit.

Verification:
- exact PR head `b3d66d2d4407dfd55df182ed113754814c9401eb`: Super Admin Browser #222, Workforce Approval #347, Deploy preflight/full regression #958 all PASS;
- merge release `e1d26b2cbc80cfb9b39fc24e7aafbdbdbebecb71`: Deploy #959 first regression attempt hit an unrelated mobile-admin permission timeout; failed-job rerun passed PostgreSQL/API/concurrency/browser/full-device regression before deploy continued;
- deploy, health and production UI smoke then PASS;
- backup: `kitchen_os_20260927T173001Z.dump`;
- runtime: `release=e1d26b2`, schema `026`, app/database `ok`, `DATA_INTEGRITY_OK`, `PRODUCTION_UI_SMOKE_OK`;
- Inventory Site Production Audit #228 / run `36337257733` PASS;
- no schema migration and no production stock rewrite;
- stale PR #161 was closed as superseded by #164.

Next warehouse hard-code work: move the separate procurement/factory rules that still identify `large-freezer` in `rules-core.js` onto database storage classification/master data. Legacy default inventory constants in `store-core.js` are no longer production inventory authority and should be retired separately without breaking SOP/skills/offline defaults.

## Completed release — Fuxing/Yongji catalog work-area normalization, 2026-09-28

PR #162 merged into `main` as `22383cdbd8828f1d1934ffdc77925b9220ebf3d3` and is verified in production through Deploy Kitchen OS to VPS #957 / run `36335664061`.

Root cause fixed:
- schema 025 had already synchronized Work Area ↔ Work Location structure, but it intentionally preserved legacy `inventory_items.work_area`;
- Fuxing/Yongji could therefore be structurally valid while shared ingredients still belonged to the wrong business Work Area;
- pre-deploy production audit #224 measured `catalog_work_area_mismatch_with_central=16` even though `work_stock_area_mismatch=0`.

Migration 026:
- derives the canonical Work Area from the active Central item with the same stable `catalog_key`;
- targets every PostgreSQL site declared as `inventory_mode=branch`, not fixed Fuxing/Yongji names;
- refuses partial correction when the target Work Area or synchronized Work Location is missing;
- relocates existing work stock transactionally to the corrected Work Location while preserving total quantity and the larger minimum;
- writes a system audit record for each corrected branch item;
- leaves branch-only catalog identities site-owned and never uses display-name heuristics.

Verified production Work Area item counts after normalization:
- Central: noodles 38, soup 1, seafood 2 = 41 items;
- Fuxing: noodles 28, soup 18, seafood 21, meat 9 = 76 items;
- Yongji: noodles 31, soup 16, seafood 17, meat 8 = 72 items.

Production verification:
- exact PR head `2deadd5275df481b711bec519a15a2ca40c2a63f`: Database Schema #244, Master Data/Admin #293, Super Admin Browser #221, Load Smoke #512 and Deploy preflight/full regression #956 all PASS;
- merge release `22383cdbd8828f1d1934ffdc77925b9220ebf3d3`: Deploy #957 passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, backup/deploy and production UI smoke;
- backup: `kitchen_os_20260927T171034Z.dump`;
- runtime: `release=22383cd`, schema `026`, app/database `ok`, `DATA_INTEGRITY_OK`, `PRODUCTION_UI_SMOKE_OK`;
- post-deploy Inventory Site Production Audit #225 / run `36336041005` PASS:
  - `catalog_work_area_mismatch_with_central=0`;
  - `work_stock_area_mismatch=0`;
  - `inventory_location_classification_violations=0`;
  - `inventory_hidden_integrity_violations=0`;
  - `stock_site_mismatch=0`, `receive_default_site_mismatch=0`, `unknown_item_site=0`.

Next inventory work: port the remaining replenishment source-routing cleanup to current `main` so Work Area/service replenishment uses database `storage_group` + sort order instead of legacy storage IDs. Procurement/factory ordering remains a separate domain.

## Completed release — unified storage/work-area model for Central, Fuxing and Yongji, 2026-09-27

PR #159 merged into `main` as `fb7c27cc64963c238ff2b86b999dac2f818f3507` and is verified in production through Deploy Kitchen OS to VPS #948 / run `36329813136`.

This release makes all three inventory sites use the same PostgreSQL classification model:
- every active storage location is explicitly classified by Database metadata as `primary` (Kho tổng / 主要儲位) or `service` (Kho khu vực / 區域儲位);
- every active Work Area owns exactly one synchronized active Work Location; the Work Location carries the same work-area identity, labels and sort order;
- Central legacy `central-work-use / 使用中` is retired. Existing work stock is moved transactionally to the item's declared PostgreSQL work area without changing same-item/site quantity;
- Fuxing and Yongji work locations and work stock use the same invariant; mismatched work stock is relocated to the item's declared work area;
- Work Area create/rename/order/activate/archive automatically synchronizes its Work Location through PostgreSQL trigger logic;
- direct mutation of a work-owned Work Location is rejected by the master-data API; Super Admin edits Work Areas instead;
- Super Admin distinguishes Storage and Work Area clearly and reports missing/orphan work locations, invalid storage groups and work-stock mismatches;
- Central, Fuxing and Yongji Website views all derive storage/work-area identity from PostgreSQL master data;
- Central now visibly separates `primary` vs `service` storage and shows the real database Work Area instead of generic `使用中`;
- Fuxing/Yongji storage grouping requires explicit `storage_group="primary"` / `"service"`; unknown values are not silently treated as service;
- browser tests no longer use display labels such as `央廚冷凍` as location identity.

Production normalization evidence:
- before Deploy #948 on schema 024: `work_stock_area_mismatch=2`, `inventory_location_classification_violations=7`;
- after migration 025: `work_stock_area_mismatch=0`, `inventory_location_classification_violations=0`;
- site isolation remains clean: `stock_site_mismatch=0`, `receive_default_site_mismatch=0`, `unknown_item_site=0`;
- hidden inventory violations remain 0;
- audited inventory totals after normalization: Central 81, Fuxing 1805, Yongji 17. Migration only changes work-location classification/routing for the same item/site and preserves quantity.

Verification:
- exact PR head `0ed9a401ee74de3b48dfc8e74a183f05d6e0adc8`: Database Schema #236, Master Data/Admin #285, Super Admin Browser #213, Workforce Approval #338, Load Smoke #504 and Deploy preflight/full regression #947 all PASS;
- merge release `fb7c27cc64963c238ff2b86b999dac2f818f3507`: Deploy #948 passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, backup/deploy and production UI smoke;
- backup: `kitchen_os_20260927T153508Z.dump`;
- runtime: `release=fb7c27c`, schema `025`, app/database `ok`, `DATA_INTEGRITY_OK`, `PRODUCTION_UI_SMOKE_OK`;
- post-deploy Inventory Site Production Audit #215 / run `36330199081` PASS with unified classification violations = 0 and hidden inventory violations = 0.

Next inventory work: continue auditing remaining non-structural restaurant hard-code (especially procurement rules/copy) separately. Storage locations and Work Areas must remain PostgreSQL master data and must never return to per-site frontend lists.

## Active candidate — Central storage-row pick shortcut, 2026-09-27

Branch: `feat/central-storage-pick-shortcut-20260927`.

Goal: reduce Central `領貨` steps without changing inventory authority. A storage row with positive quantity can open the shared Pick controller focused on the exact database item and exact source storage location.

Implemented:
- authorized/online Central storage rows with stock > 0 expose a compact `領貨` action;
- shortcut carries stable database item key + source location code, never display labels;
- shared operation controller accepts optional initial source location and selects the matching source option by database location code;
- focused search still isolates the exact item; manual search clears item/source deep-link state;
- manual mode changes and overview drill-down clear operation focus to prevent stale preselection;
- no API/schema/permission/stock semantics change.

Candidate is not production-complete until exact-head CI, merge, production deploy/health and UI smoke pass.


## Completed release — Central priority receive shortcut, 2026-09-27

PR #156 merged into `main` as `07d42a30eab8932507c3ccdd54f92f6a8f69a853` and is verified in production through Deploy Kitchen OS to VPS #903 / run `36301227833`.

This release reduces Central receiving friction while keeping PostgreSQL/VPS API as the only inventory authority:
- every low-stock row in `待處理 / Cần xử lý` keeps the existing storage drill-down and, for authorized operators, adds a per-row `進貨` shortcut;
- the shortcut carries the stable database item key plus the exact shortage location code into the shared inventory operation controller;
- the operation controller can start focused on one exact item and preselect the matching database-declared destination location;
- destination options now expose their database location code for precise UI reconciliation;
- editing the operation search clears the deep-link focus and returns to the normal generic search behavior;
- desktop/mobile priority layout was adjusted without adding fixed business master data.

Verification:
- exact PR head `bdbaffcb737a8d5350a26ff9fd51babb3bbad66b`: Deploy preflight/full regression #902 / run `36300779804`, Super Admin Browser #170 / run `36300779802`, and Workforce Approval #295 / run `36300779803` all PASS;
- merge release `07d42a30eab8932507c3ccdd54f92f6a8f69a853`: Deploy #903 / run `36301227833` passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, server backup/deploy and production UI smoke;
- backup: `kitchen_os_20260927T065418Z.dump`;
- production audit: `DATA_INTEGRITY_OK`; runtime returned `release=07d42a3`, `schema=024`, app/database `ok`; `PRODUCTION_UI_SMOKE_OK` passed;
- no schema migration, endpoint change, permission change or production stock rewrite.

Next Central work: continue reducing friction in `領貨 / 轉撥 / 出貨` using database-keyed preselection and existing transaction APIs; do not introduce browser-side business authority.

## Completed release — Central Kitchen operator priority workspace, 2026-09-27

PR #154 merged into `main` as `26bfd49c6f5ba7586dcc2bdc411569f69d14acd2` and is verified in production through Deploy Kitchen OS to VPS #900 / run `36291179320`.

This release turns the Central Kitchen Overview into a more operational workspace while preserving the same PostgreSQL authority:
- adds a `待處理 / Cần xử lý` panel only on Central Overview;
- derives alerts strictly from each PostgreSQL-projected stock row whose current quantity is below its configured minimum;
- never aggregates quantities across incompatible units;
- shows item, database-declared storage label, actual/minimum quantity and empty/low state;
- sorts empty stock before low stock and then by shortage size;
- shows the first six actionable rows plus a count for remaining rows;
- clicking an alert returns to storage view and filters the exact database-declared storage location;
- renders an explicit healthy state when no row is below minimum;
- exposes quick `進貨入庫` only when the existing edit permission and cloud readiness already allow inventory operations;
- responsive layout uses two columns on desktop and one column on mobile.

Verification:
- exact PR head `5667b411b63190acae7cc7b5a23c32db5e0b5309`: Deploy #899 / run `36290930131` preflight/full regression PASS, Super Admin Browser #168 / run `36290930053` PASS, Workforce Approval #293 / run `36290930009` PASS;
- merge release `26bfd49c6f5ba7586dcc2bdc411569f69d14acd2`: Deploy #900 / run `36291179320` passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, server backup/deploy and production UI smoke;
- backup: `kitchen_os_20260927T032703Z.dump`;
- production audit: `DATA_INTEGRITY_OK`; runtime returned `release=26bfd49`, `schema=024`, app/database `ok`; `PRODUCTION_UI_SMOKE_OK` passed;
- Inventory Site Production Audit #166 / run `36291520138` PASS; workforce staff/schedule/attendance parity/backfill post-deploy workflows also PASS;
- no schema migration, permission change, endpoint change or production stock rewrite.

Next Central work: continue operator-facing UI refinement on the database-declared model, especially reducing friction in daily receive/pick/transfer/ship flows without reintroducing mutable business hard-code.

## Completed release — Central Kitchen inventory UI redesign, 2026-09-27

PR #152 merged into `main` as `7157d0b5263209b3391ccab57c088668d7902973` and is verified in production through Deploy Kitchen OS to VPS #898 / run `36287068079`.

This stage redesigns the 央廚 / Bếp trung tâm inventory workspace without changing PostgreSQL transaction authority:
- dedicated Central shell with database-derived site identity, connection state and four KPIs: ingredient count, storage-location count, low-stock count and work-area count;
- responsive function navigation for Overview / 入庫 / 領貨 / 轉撥 / 出貨 / 管理 / 紀錄;
- storage and work-area overview cards are generated from PostgreSQL master data;
- daily operation modes continue to use the existing authoritative inventory operation controller and APIs;
- Manage mode is visually separated from daily inventory movement;
- dedicated late-loaded `src/central-kitchen-ui.css` protects responsive/mobile layout from legacy override chains;
- Central remains live across service-date changes and is not subject to branch historical-date locking.

Integration corrections found by CI and fixed before merge:
- legacy runtime guards still looked for `.central-heading`; after the redesign this allowed both the branch renderer and Central auth observer to rerender the new shell;
- those guards now use `[data-central-kitchen-shell]`, preventing branch rendering from taking over the Central page;
- dirty Central ingredient editors are preserved across both inventory-updated and cloud-status events, so a Super Admin peer edit shows the stale-draft warning instead of erasing unsaved input;
- regression contracts now validate the redesigned KPI/navigation shell rather than requiring the retired branch summary markup.

Verification:
- exact PR head `df64c415950acccb3741cc43e75052710a1c3618`: Deploy preflight/full regression #897 / run `36286847264`, Super Admin Browser #167 / run `36286847257`, Workforce Approval #292 / run `36286847258`, Attendance #48 / run `36286847249` and Schedule #150 / run `36286847278` all PASS;
- merge release `7157d0b5263209b3391ccab57c088668d7902973`: Deploy #898 / run `36287068079` passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, server backup/deploy and production UI smoke;
- backup: `kitchen_os_20260927T020142Z.dump`;
- production audit: `DATA_INTEGRITY_OK`; runtime returned `release=7157d0b`, `schema=024`, app/database `ok`; `PRODUCTION_UI_SMOKE_OK` passed;
- Inventory Site Production Audit #164 / run `36287397492` PASS; workforce schedule/staff/attendance post-deploy verification runs also PASS;
- no schema migration, permission change, endpoint change or production stock rewrite.

Next Central work: iterate the operator-facing Central Kitchen UI on this database-declared model; do not reintroduce hard-coded site/location/work-area business master data.

## Completed release — inventory UI master-data cutover, 2026-09-27

PR #150 merged into `main` as `b1447b727e310b7a3095f5782c0a933916ef6234` and is verified in production through Deploy Kitchen OS to VPS #885 / run `36270568342`.

This stage finishes the inventory UI cutover from mutable frontend assumptions to PostgreSQL-loaded master data:
- branch inventory overview/manage/editor reads storage and work-area groups from `inventoryUiGroups(activeSite)`;
- primary/service storage grouping follows PostgreSQL `metadata.storage_group`;
- work-stock source summaries use database-declared primary locations;
- branch authority follows database-declared `inventory_mode`, not Fuxing/Yongji closed lists;
- branch and Central item units are free-form required values with suggestions derived from database inventory, so a new unit does not require frontend code;
- Central default work area and new-item storage location come from PostgreSQL master data; fixed `central-work-use`, `noodles`, `CENTRAL_UNITS` and source storage-label fallbacks are retired from inventory UI;
- Central management tabs and Settings site labels use current PostgreSQL names rather than fixed Central/Fuxing/Yongji labels;
- branch dashboard/runtime uses only the site-scoped PostgreSQL snapshot or an empty inventory and cannot expose source-seeded stock;
- mobile Settings now supports long database-provided site names without clipping;
- WebKit regression policy only ignores the known localhost/127.0.0.1 test-proxy access-control false positive for master-data requests; real hosts and non-WebKit engines remain actionable.

Verification:
- exact PR head `b588b6673af3b0ec9dacc012dc59f06e77fc6ec0`: Deploy preflight/full regression #884 / run `36270023775`, Super Admin Browser #155 / run `36270023766`, and Workforce Approval Diagnostic #280 / run `36270023752` all PASS;
- merge release `b1447b727e310b7a3095f5782c0a933916ef6234`: Deploy #885 / run `36270568342` passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, server backup/deploy and production UI smoke;
- backup: `kitchen_os_20260926T204907Z.dump`;
- production audit: `DATA_INTEGRITY_OK`; runtime returned `release=b1447b7`, `schema=024`, app/database `ok`; production UI smoke passed;
- no schema migration and no production stock rewrite.

Next work: redesign the Central Kitchen (央廚) inventory UI on the database-declared site/location/work-area model without reintroducing hard-coded business master data.

## Completed release — PostgreSQL-only inventory runtime authority, 2026-09-27

PR #148 merged into `main` as `d88a90d9487d8edbb5f7e8020397893a5a5e9849` and is verified in production through Deploy Kitchen OS to VPS #872 / run `36265842924`.

This release retires the remaining browser-local inventory mutation authority:
- branch Website no longer maintains a writable draft inventory database or local operation log;
- Central Kitchen no longer seeds a hard-coded product catalog, merges local draft stock, writes local Central/branch drafts, or records a separate local inventory history;
- failed quantity/catalog/archive/transfer writes reconcile from VPS/PostgreSQL and are never treated as local success;
- `canInventoryDraftCount` and the draft inventory operation controller were removed;
- branch/Central localStorage inventory data is now limited to read-only last-server-projection caches for recovery/UI continuity;
- empty PostgreSQL projections such as `[]` remain authoritative and cannot trigger a hard-coded reseed;
- the warehouse switcher renders active sites from the PostgreSQL-backed site registry instead of fixed Central/Fuxing/Yongji buttons;
- site isolation remains enforced on the read-only branch snapshot cache.

Verification:
- exact PR head `95d9ce407f27a96240fcc261b15671a8f1a77e43`: Deploy preflight/full regression #871 / run `36265521181` and Workforce Approval Diagnostic #268 / run `36265521167` PASS; the prior exact-head Super Admin Browser #142 also passed after the same runtime changes;
- merge release `d88a90d9487d8edbb5f7e8020397893a5a5e9849`: Deploy #872 / run `36265842924` passed preflight, PostgreSQL/API/concurrency/browser/full-device regression, backup/deploy and production UI smoke;
- backup: `kitchen_os_20260926T192740Z.dump`;
- production audit: `DATA_INTEGRITY_OK`; runtime returned `release=d88a90d`, `schema=024`, app/database `ok`; `PRODUCTION_UI_SMOKE_OK` passed;
- no schema migration and no production stock rewrite.

Next inventory work: remove remaining mutable inventory master/rule hard-codes that can still force frontend changes when Database structure changes, then redesign the Central Kitchen UI on the database-declared model.

## Completed release — realtime Database site registry, 2026-09-27

PR #146 merged into `main` as `95a39088a33f61c218412c1dd2e2d253306a0471` and is verified in production through Deploy Kitchen OS to VPS #867 / run `36262880282`.

This stage makes the PostgreSQL site registry propagate to already-open Kitchen OS and Super Admin sessions without requiring a manual reload:
- successful Super Admin site create/update publishes a dedicated authenticated SSE `site-registry` invalidation;
- Website sessions re-read `/api/inventory/sites`, scope the registry cache to the authenticated user, reject stale responses from a previous login, re-evaluate the active site, and emit `shitu:inventory-sites-changed`;
- branch detection and branch operation availability use database-declared `inventory_mode` instead of a Fuxing/Yongji closed list;
- Super Admin refreshes site controls from the same event; the inventory Database workspace defers an active-site replacement while an editor is dirty/pending so old-site data cannot render under a new site;
- an unrelated site rename/addition updates the registry/UI without forcing a full stock reload for the unchanged active site;
- focus/visibility remain fallback convergence paths if an SSE event was missed.

Verification:
- exact PR head `eedaaca8244e880152d5273bccb71bd1e231b4f9`: Master Data/Admin Panel #242 / `36262376642`, Isolated API Load #461 / `36262376637`, Workforce Approval Diagnostic #264 / `36262376644`, Super Admin Browser #139 / `36262376652`, and Deploy preflight/full regression #866 / `36262376632` all PASS;
- merge release `95a39088a33f61c218412c1dd2e2d253306a0471`: Deploy #867 / `36262880282` passed preflight, API/PostgreSQL/concurrency/browser/full-device regression, server-side backup/rollback deployment, production health/release check and production UI smoke;
- backup: `kitchen_os_20260926T183652Z.dump`;
- production audit: `DATA_INTEGRITY_OK`; runtime returned `release=95a3908`, `schema=024`, app/database `ok`; `PRODUCTION_UI_SMOKE_OK` passed;
- no schema migration and no production stock rewrite.

Next inventory work: retire obsolete browser-local inventory mutation/draft compatibility paths while preserving safe read-only recovery cache semantics, then redesign the Central Kitchen UI on database-declared structure.


## Completed release — Super Admin Database control plane / inventory master-data hardening, 2026-09-27

PR #144 merged into `main` as `15ba0013f15daa9dcdc04152c95f12bd9f7fc793` and was deployed by Deploy Kitchen OS to VPS #856 / run `36259731875`.

This release formalizes the product direction that Super Admin is the normal business Database control plane while PostgreSQL remains authoritative behind the VPS API. Routine inventory/master-data maintenance should not require SSH or manual PostgreSQL editing.

Inventory hardening in this release:
- legacy helper paths derive site, storage-location and work-location structure from PostgreSQL-loaded inventory master data instead of closed Central/Fuxing/Yongji lists;
- Central storage labels in those helper paths come from database master data instead of fixed source-code mappings;
- Super Admin Database explicitly presents PostgreSQL as the business-data authority while all edits still pass through API authorization, validation and audit;
- regression contracts prevent the removed site/location hard-codes from returning.

Verification:
- PR head `1a3302fc39ab3f01ac7f208c50958ec24af0882a`: Master Data/Admin Panel #232 / `36259541053`, Super Admin Browser #129 / `36259541041`, and Workforce Approval Diagnostic #254 / `36259541059` all PASS;
- merge release `15ba0013f15daa9dcdc04152c95f12bd9f7fc793`: deploy #856 / `36259731875` preflight, API/inventory regression, Super Admin branch inventory database round-trip, PostgreSQL concurrency, desktop/mobile Chromium, full-device cross-browser, exact-SHA deploy with server-side backup/rollback, production health/release check and production UI smoke all PASS;
- schema remains `024`; no schema migration and no production stock rewrite were performed.

Realtime site-registry propagation is now complete in PR #146 / production #867. Next inventory work is retirement of obsolete browser-local draft/mutation compatibility code before the Central Kitchen UI redesign.

## Completed correction — Central workplace choices

The manager Role workplace correction is now included in verified production through release `15ba0013f15daa9dcdc04152c95f12bd9f7fc793`. Assigned Roles can select any active physical site, including Central, while `all` remains logical global scope and the central-only Role remains fixed to Central. The main Website and Super Admin account editors use database-declared active sites rather than a closed branch list. No account-data rewrite or schema migration was required.

## Completed correction — Super Admin Role and workplace, 2026-09-25

- PR #140 merged as `b4d9cbe11caac5352226fde228cf88e07c7e4a57`. The user-reported `INVALID_LOCATION` came from retaining `all` when changing an administrator to an assigned branch Role. The editor now offers only `all` for all-scope Roles, `central` for the central Role, or active branch sites for assigned Roles. It retains a selected branch across Role changes and preserves custom module permissions. The form validates before submitting and reports a readable error if the API rejects the workplace. Six-device Super Admin regression and PostgreSQL account create/reload passed.
- Deploy #847 / run `36151553155` passed full regression but stopped before activating its frontend because the production integrity script read stale legacy `app_users.permissions` JSON for a new administrator. PR #141 fixed that audit to check effective role policy plus permission overrides, retaining a hard failure for actual missing admin rights; no production account data was rewritten.
- **Verified production release:** PR #141 merged as `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`. Deploy #849 / run `36153187681` passed preflight, API/PostgreSQL/browser/device regression, backup, corrected `DATA_INTEGRITY_OK` with all admin module permissions OK, deploy, health and `PRODUCTION_UI_SMOKE_OK` including the permission modal. Runtime returned `release=f2ea2b3`, `schema=024`, app/database `ok`. Backup: `kitchen_os_20260925T152227Z.dump`.

The current runtime release, rather than the older static `development-status.mjs` release-evidence milestone, is authoritative for production SHA. A future status-metadata update can refresh that fallback without changing account/business data.


## Completed correction — 2026-09-25

- PR #139 merged as `ee5316b8ae5f12f2288aebf54e9e9cede3756ba0`. VPS deploy #843 / run `36142844487` passed preflight, full regression, backup/deploy and production UI smoke; production health returned `release=ee5316b`, `schema=024`, `app=ok`, `database=ok`. Backup: `kitchen_os_20260925T134859Z.dump`.
- Central/Fuxing/Yongji now share site-scoped PostgreSQL master labels/options and authoritative catalog/stock snapshots between the main website and Super Admin. Central overview Edit opens its form; branch ingredient writes send the explicit form draft through the catalog API. Clean open forms refresh after remote changes; unsaved drafts remain visible and cannot submit stale values until reopened. Mobile WebKit ingredient editors fit without page overflow.
- Super Admin ingredient rows show work area and storage with compact Edit and expandable stock, receiving and archive actions. There was no schema migration or production data rewrite.
- Exact-head CI passed Super Admin Browser `36142056162` on six device profiles, with independent two-session edits/reloads on all three sites at 320px and 1366px; complete API/PostgreSQL/browser/device regression `36142055831`, API load `36142055866`, workforce diagnostic `36142055825`. The merged release passed its own full regression and production smoke (`PRODUCTION_UI_SMOKE_OK`).

Last updated: 2026-09-27 (Asia/Taipei)

This document is the current continuation point for any developer or future ChatGPT session working on Kitchen OS. It must be updated whenever a significant production fix, schema migration, deployment, or workstream handoff occurs.

Do not store credentials, private keys, passwords, database secrets, or SSH secrets in this repository.

## Completed release — Super Admin branch inventory database

PR #138 merged as `5cc4f907387873367d78dfbdfb3183971846e968` and deployed through #832 / run `35672333632`. The Database section now has a dedicated inventory workspace while retaining the other generic data tables. It supports independent site layouts, bilingual item/location/work-area editing, per-location stock/minimum actions, receiving defaults, relocation, history and local-site integrity checks. Existing work-stock must move through relocation; metadata saves do not replay quantities.

Optional stale-write guards and append-only stock associations preserve concurrent changes. Master-data/catalog writes publish inventory invalidations; dirty forms retain input until explicitly closed. No schema migration or destructive data conversion.

Verification completed: exact PR head `923f36a` passed all checks; Super Admin Browser run `35671898006` passed all six profiles, save/reload, peer-edit notification, stale-submit rejection and dirty-input retention. Master Data/Admin API run `35671897948` passed. The merged release passed full-system regression, VPS backup/deploy, runtime health/release checks and production UI smoke in run `35672333632`. Runtime returned `release=5cc4f90`, `schema=024`, `app=ok`, `database=ok`; inventory site-isolation audit passed with zero violations. Local Cloud Browser preview was unavailable; device evidence comes from CI, not a physical-device certification.

Open `https://82.47.180.185.nip.io/.admindev.html#data` and select a branch. This stage is complete; no branch setup data was automatically copied or rewritten. The production development-status fallback text was authored before deployment; this document and the live runtime/workflow evidence supersede its candidate wording. Older workforce candidate notes below are historical.

## 1. Repository / production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Branch of record: `main`
- Current verified production SHA: `26bfd49c6f5ba7586dcc2bdc411569f69d14acd2`
- Production URL: `https://82.47.180.185.nip.io`
- Super Admin URL: `https://82.47.180.185.nip.io/.admindev.html#development`
- Canonical one-link handoff: `https://vial1307.github.io/restaurant-management-system-demo/handoff.html`
- Production database schema: PostgreSQL migrations through schema 024.
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Browser localStorage is cache/UI state only; it is not an authoritative shared inventory/business database.

## 2. Last verified production release

The current verified production deployment is:

- Workflow: Deploy Kitchen OS to VPS #900
- Run ID: `36291179320`
- Tested/deployed commit: `26bfd49c6f5ba7586dcc2bdc411569f69d14acd2`
- Result: SUCCESS
- Preflight: PASS
- API/inventory regression: PASS
- Super Admin branch inventory database round-trip: PASS
- PostgreSQL concurrency regression: PASS
- Desktop/mobile Chromium regression: PASS
- Full-device cross-browser regression: PASS
- SSH deploy with server-side backup/rollback path: PASS
- Production health/release check: PASS
- Production UI smoke: PASS
- Database schema: `024`
- Schema migration / production stock rewrite: NONE
- Previous verified inventory site-integrity baseline remains zero violations; this release did not change schema or stock data.
- Historical schedule cutover prerequisite: Parity #105 / `35571899839` and Backfill verify #316 / `35571899835` passed on release `30fd1dd`; these are historical schedule verification runs, not #856 verification.

Production audit after schema 022:

- `stock_site_mismatch = 0`
- `receive_default_site_mismatch = 0`
- `unknown_item_site = 0`

This release includes the earlier inventory persistence/SSE work, PR #138 branch-scoped Super Admin Database configuration, PR #139 main ↔ admin convergence, PR #140/#141 account/RBAC corrections, the Central assigned-workplace correction, and PR #144 Database-control-plane inventory master-data hardening. It changes no database schema, stock quantities or schedule authority.

Never claim a newer production SHA until its deploy + production smoke jobs are green.

## 3. Completed: inventory overview/editor real-time convergence

Production evidence:

- PR #133 merged as `a5da75d4dac54c38abbf825bc1d247798d25ba14`;
- final production source includes the test-only PR #134 merge `09e2fffc80bf186d15054002c00421a2a5525e8f`;
- Deploy #815 / run `35549929164`: PASS;
- exact release endpoint: `09e2fff`;
- schema remains `024`;
- preflight, API, PostgreSQL concurrency, desktop/mobile Chromium, full-device cross-browser, deploy, health/release and production UI smoke: PASS.

User-reported defects:

- quantity/minimum writes were still re-denied by legacy role names after `inventory.edit` had been explicitly granted;
- the Central overview showed work area and storage location as read-only even though the product editor could change them;
- branch scalar overview edits performed an optimistic local write/full render before database confirmation;
- the branch page rendered the current site-scoped cloud mirror, but its edit handlers and modal still looked up items in the stale long-lived store;
- `subscribeRealtime()` was a placeholder, so another tab/device waited for focus or the 60-second poll.

Production behavior:

- explicit `inventory.edit` plus allowed site scope is the single write authority for all exposed inventory fields; view-only and foreign-site accounts remain denied;
- Central overview work-area/storage selectors persist through catalog sync/transactional relocation and reconcile the product editor from PostgreSQL;
- branch overview quantity/minimum writes no longer mutate local state first and perform one forced authoritative reconciliation;
- today's branch overview, quick actions, transfers and product modal all layer the same site-scoped PostgreSQL mirror over the store before resolving an item;
- every successful inventory mutation publishes an authenticated SSE invalidation; other tabs/devices coalesce it, ignore their own source id and refresh the active permitted site;
- polling/focus/visibility remain fallback convergence paths;
- receive-default editing follows the same explicit edit-permission rule.

Two-tab browser regression proves an overview minimum write reaches PostgreSQL and repaints an already-open peer editor from the forced SSE snapshot. Direct rendered database item/location IDs prevent stale UI lookup from suppressing a valid write. Cross-tab shared `localStorage` equality no longer suppresses the peer document repaint.

### Exact next work

1. Preserve the inventory write/realtime invariants; do not reopen them as browser-local state.
2. Continue normalized-domain/database redesign one domain at a time.
3. Review and deploy the separate workforce-schedule relational read candidate only after its full regression job passes with the gate ON.
4. Keep compatibility schedule writes until relational reads have remained stable in production; compatibility retirement is a later explicit stage.

Verification prerequisite completed on 2026-09-21:

- Queue correction PR #136 merged as `30fd1ddff89cd821b5a66fe54ececca9f9e9825f` and deployed through #823 / run `35571481421`.
- Schedule Parity #105 / run `35571899839` passed against exact production release `30fd1dd`.
- Schedule Backfill verify #316 / run `35571899835` passed against the same exact release `30fd1dd`.
- The separate cutover candidate defaults VPS relational schedule reads ON and runs the complete deploy regression job with the gate ON.
- Compatibility schedule writes and module revision tokens remain active. Immediate rollback is `WORKFORCE_SCHEDULE_RELATIONAL_READ=false` in VPS `.env` followed by app-container recreation.

## 4. Completed: cross-site inventory tab synchronization

User-reported problem:
- Switching 央廚 / 復興 / 永吉 could visually change the selected site while the visible data still came from a previous site or from a recent client cache.

Root causes fixed:
1. Site UI could render before PostgreSQL hydration completed.
2. Inventory sync used one shared queue, allowing a late response from a previously active branch to overwrite the shared branch record.
3. Site switching could reuse the short-lived VPS inventory/master-data cache instead of forcing a fresh database-backed snapshot.

Current behavior:
- Interactive site switching uses `switchActiveInventorySite()`.
- The target site is hydrated before `shitu:active-site-changed` is emitted.
- If hydration fails, the active-site preference rolls back instead of displaying a new site with stale data.
- `applyBranch()` rejects stale branch hydration when the response site is no longer the active site.
- Interactive site switching forces fresh inventory + master-data fetches from VPS, bypassing the short client cache.

Important files:
- `src/inventory-cloud.js`
- `src/auth-layer.js`
- `tests/mobile-role-site-certification.mjs`
- `tests/static-regression.mjs`

Important commits:
- `13f8312e` — hydrate target site before warehouse switch render
- `13c9498c` — await PostgreSQL hydration in site-switch UI
- `9b2de03e` — prevent stale branch sync from overwriting active site
- `dbfecf66` — regression for real Yongji -> Central -> Fuxing transitions
- `483833a9` — force fresh VPS snapshot on every interactive site switch
- `d15ae208` — static guard requiring the forced VPS refresh behavior

## 5. Completed: storage relocation must use PostgreSQL

User-reported problem:
- Changing an item's storage location, e.g. 大冷凍 -> 4門冰箱 / 廚房冰箱 / 大冷藏, could fail or behave like a local/catalog metadata edit rather than a real inventory movement.

Root cause:
- The storage-location dropdown in the inventory management table previously used catalog sync. Catalog sync is configuration-oriented and is intentionally prevented from silently deleting stock rows that still contain quantity.
- Therefore changing `zone` was not equivalent to moving physical stock.

Current solution:
- New endpoint: `POST /api/inventory/relocate-storage`.
- The operation runs in one PostgreSQL transaction.
- It locks the source/destination stock rows.
- It moves the entire source quantity into the destination quantity.
- Destination minimum becomes the max of the existing destination minimum and source minimum.
- The old source stock association is removed.
- If the item's fixed receiving location points to the old storage location, it is moved to the destination location in the same transaction.
- A transfer transaction is written when moved quantity > 0.
- An `inventory_storage_relocate` audit log is always written.
- The UI does not optimistically change local `zone`; it waits for VPS confirmation and reloads the authoritative inventory snapshot.

Important files:
- `vps/backend/src/inventory-extra-routes.mjs`
- `src/vps-api.js`
- `src/inventory-cloud.js`
- `src/app.js`
- `vps/backend/scripts/api-regression.mjs`
- `tests/static-regression.mjs`
- `tests/catalog-stocktake-boundary-regression.mjs`

Important commits:
- `e9b1f4bf` — atomic storage relocation API
- `d50c0a38` — VPS API client wrapper
- `f0a36165` — database-backed relocation client
- `ebb0453b` — branch storage dropdown uses PostgreSQL relocation
- `41b5887f` — API regression proving source/destination/minimum/receive-default results
- `b8942bc8` — frontend static guard
- `656ea272` — preserve stocktake permission regression while using scoped site variable

Regression proof:
- API test creates a branch item in `fuxing-freezer` with quantity/minimum.
- It relocates the item to `fuxing-four`.
- The test requires the source stock association to disappear, destination quantity/minimum to be correct, and fixed receive default to move to `fuxing-four`.

## 6. Inventory invariants that must not be broken

- `領貨`: branch internal withdrawal/use flow.
- `庫存轉撥`: same-site movement between storage locations.
- `出貨`: cross-site transfer.
- Cross-site direct transfer must remain atomic: source decrement + destination increment in one DB transaction.
- Internal location relocation is not a catalog metadata edit.
- Quantity/minimum, catalog metadata and receiving-default writes require explicit `inventory.edit` within allowed site scope; a role name cannot re-deny a granted edit permission.
- Receiving-default routing remains database-backed and site-scoped.
- No browser code may connect directly to PostgreSQL.
- Every inventory mutation must be authenticated, authorized, validated and auditable server-side.
- Never overwrite VPS stock from a stale browser snapshot.
- Equivalent behavior must work for 央廚 / 復興 / 永吉 unless an explicit business rule differs.

## 7. Super Admin / catalog synchronization state

Completed:
- Super Admin standalone panel exists at `/.admindev.html`.
- `superadmin` role/capability is separate from ordinary admin.
- Inventory catalog audit separates:
  - identity drift: VI/Traditional Chinese naming differences
  - operational variance: unit/work_area/storage_only differences
- Receive-default backfill migration 019 completed.
- Identity majority synchronization migration 020 completed.
- Manual identity resolver exists for ambiguous remaining catalog-name drift and is audit logged.

Do not auto-normalize operational variants without business confirmation.

## 8. Next work queue requested by product owner

Do these after inventory site/relocation stability is confirmed.

### P1 — Database redesign for secure editable data

Goal:
- redesign the database/data-admin surface so authorized administrators can safely add/edit operational data behind the VPS API.

Requirements:
- PostgreSQL remains private behind VPS API; never expose DB credentials/browser SQL access.
- Use explicit server-side allowlists, validation and capability checks.
- Add audit history for sensitive CRUD.
- Prefer relational canonical data where shared business facts require consistency.
- Define migration + rollback/backfill path before destructive schema changes.
- Keep backups and production integrity audit in the deploy path.
- Review existing `docs/DATABASE_CORE_V2.md` and `docs/DATABASE_PERSISTENCE_AUDIT.md` before creating new schema.

### P2 — Repository handoff / engineering journal

This file and `docs/WORK_LOG.md` are the initial implementation.

Continue by maintaining:
- current production SHA/run
- current schema version
- current feature/fix being worked on
- last successful verification
- failed runs and root causes
- exact continuation point
- important files/commits
- known risks
- ordered backlog

Recommended future addition:
- PR/issue templates that require a work-log update for production-impacting changes.
- A lightweight `docs/STATUS.md` generated/updated by developers when releasing.

### P3 — VPS detailed metrics in Super Admin

Add detailed server/database health data, without exposing secrets:
- total/used/free disk
- memory total/used/available
- CPU/load
- uptime
- container/service status
- PostgreSQL database size
- table/index size summaries
- active/max DB connections
- backup footprint
- frontend/backend deployed SHA
- schema version
- network interface totals / bandwidth counters when available from the host
- optional recent traffic rate if a reliable host metric source exists

Security:
- Super Admin-only endpoint.
- Never return passwords, environment secrets, session secrets, private keys, connection strings or raw sensitive process environment.
- Prefer a narrow server metrics API rather than shell access from the browser.

## 8. Deployment policy

Production workflow:
- `.github/workflows/deploy-vps.yml`
- exact tested commit only
- preflight gate
- API/PostgreSQL regressions
- browser/mobile/full-device regressions
- server-side PostgreSQL backup
- schema migrations
- production integrity audit
- health/release SHA verification
- production UI smoke

Never bypass the release gates to push a fix directly to production.

## 9. Immediate continuation procedure

When resuming work:
1. Fetch current `main` HEAD and read the live release/schema shown in Super Admin GitHub/Handoff.
2. Check the newest `Deploy Kitchen OS to VPS` run before treating a newer commit as production.
3. Current verified production baseline is #783 / `5bc9d92e878510c0646acced2b8070750778529c`, schema `024`.
4. Re-test storage relocation and cross-site switching if any inventory code changes.
5. Finish warehouse-switch UX feedback first; then continue normalized-domain/database redesign from the schema-022 green baseline, one domain at a time.
6. Update this file, `docs/STATUS.md` and `docs/WORK_LOG.md` at the end of the next substantial work session.


## 2026-09-18 continuation — secure admin writes and VPS telemetry

The inventory synchronization/relocation baseline above remains authoritative and must not be rewritten.

A continuation branch `fix/secure-admin-data-vps-metrics-20260918` was created from main `d84484a15bd835e7890921267ba59984ca37967a`. This branch hardens the existing Super Admin database surface instead of creating a parallel database authority, and adds filtered VPS metrics without exposing host/Docker/PostgreSQL internals directly to the browser.

Key new invariants on the candidate branch:

- generic admin datasets remain static backend allowlists, never arbitrary SQL/table access;
- unknown fields fail closed;
- durable identity columns are immutable after creation;
- update/archive must carry the currently loaded database `row_revision` token and stale writes return conflict;
- inventory with non-zero relational stock cannot be archived through generic CRUD;
- host metrics are collected outside the app container into a filtered file mounted read-only;
- `/api/admin/super/system-metrics` requires `system.super_admin`;
- monthly provider bandwidth quota is not guessed from host counters.

See `docs/STATUS.md` for the active short workboard. Do not mark this candidate as production until CI, deployment release verification and production smoke are green.


## 2026-09-19 — PR #108 current continuation

Main now contains merge commit `d2acef474866460c75ce66b6f5675306481bb65b` from PR #107, including schema 021 and secure Admin/Data/VPS metrics work. This commit is **not yet verified production**.

Production deploy workflow run `35372160924` passed preflight and full regression, then stopped during the new host-metrics install step:

- stopping point: `Installing filtered host metrics snapshot`;
- `kitchen-os-host-metrics.service` exited 1;
- failure happened before backup, migration, container restart and release verification;
- therefore the last verified production remains `d15ae2087d293111b989b5e5efe7d56ac3bebb84`, schema 020.

Current continuation:

- branch: `fix/host-metrics-deploy-resilience-20260919`;
- draft PR: #108;
- current work link: `https://github.com/vial1307/restaurant-management-system-demo/pull/108`;
- immediate code focus: `vps/scripts/collect-host-metrics.sh`, `vps/scripts/install-host-metrics-timer.sh`, `vps/scripts/deploy.sh`.

PR #108 also adds a Super Admin **GitHub & Handoff** section backed by a Super Admin-only API. It shows the current PR/branch, verified production vs candidate state, failed workflow, exact stopping point, code-focus files, handoff docs and ordered next steps. The endpoint must remain metadata-only and must never expose credentials, environment dumps, SSH keys, private keys or direct host/database access.

Next developer must read this file, `docs/STATUS.md`, `docs/WORK_LOG.md` and `docs/DEVELOPMENT_RULES.md` before changing production code.


## 2026-09-19 — Release #724 verified production

Verified production now is:

- commit: `3a3392133483c6575a63d61a04d085a2d50df692`;
- workflow: Deploy Kitchen OS to VPS #724;
- run ID: `35377327661`;
- schema: `021`;
- production UI smoke: PASS.

The previous host-metrics deployment blocker is resolved. The production deploy log proves:

- exact tested target `3a3392133483c6575a63d61a04d085a2d50df692`;
- pre-deploy PostgreSQL backup created;
- migration `021_admin_row_revisions.sql` applied;
- `OK: schema version 021`;
- `OK: Super Admin revision columns = 5`;
- `OK: Super Admin revision triggers = 5`;
- API healthy;
- Web/API/Super Admin edge healthy;
- release endpoint returned `3a33921`;
- production UI smoke completed successfully.

The Super Admin GitHub/Handoff feature is therefore production-capable. A follow-up branch `chore/runtime-handoff-status-20260919` changes the status API/UI so the live release/schema come from the currently serving runtime rather than a manually maintained SHA. Static metadata remains only for handoff context, resolved incidents and the ordered next queue.

VPS capacity audit run `35377327695` also passed. At audit time the host reported Ubuntu 22.04.5 LTS, 2 vCPU, a 49 GB root filesystem with about 44 GB available, and primary interface `eth0`. Provider monthly traffic quota is still intentionally unknown until real provider-plan data is configured.

### Next continuation after runtime-handoff follow-up

1. Read `CURRENT_HANDOFF.md`, `STATUS.md`, `DATABASE_CORE_V2.md` and `DATABASE_PERSISTENCE_AUDIT.md`.
2. Continue normalized-domain/database redesign one domain at a time.
3. Keep Browser/UI -> VPS API -> PostgreSQL as the only authoritative write path.
4. Do not use generic Super Admin CRUD for operations whose invariants require dedicated transactions.
5. Preserve schema 021 row revision concurrency protection and inventory relocation/site-refresh invariants.


## 2026-09-19 — Release #726 final verified production

The runtime-backed GitHub/Handoff follow-up was merged as:

- commit: `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- workflow: Deploy Kitchen OS to VPS #726;
- run ID: `35378902959`;
- schema: `021`;
- production UI smoke: PASS.

Production deploy evidence:

- exact tested target `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- pre-deploy backup created successfully;
- API healthy;
- `OK: schema version 021`;
- `OK: Super Admin revision columns = 5`;
- `OK: Super Admin revision triggers = 5`;
- Web/API/Super Admin edge healthy;
- release endpoint returned `9aae83a`;
- production UI smoke completed successfully.

Super Admin GitHub/Handoff now separates static continuation metadata from live runtime truth. The protected status endpoint derives the currently serving release and schema at request time, so future releases do not require a manually maintained production SHA in the UI.

VPS Capacity Audit #5 / run `35378899688` passed for this workstream. At audit time the host reported:

- Ubuntu 22.04.5 LTS;
- 2 vCPU on Intel Xeon E-2236;
- about 3.85 GiB visible memory;
- 49 GB root filesystem, about 44 GB available;
- healthy web/API/PostgreSQL containers;
- primary interface `eth0`;
- host counters around 16.29 GB RX and 0.73 GB TX since boot;
- external HTTPS samples mostly around 0.51–0.70 seconds.

Provider monthly traffic quota is not derivable from host counters and remains intentionally unconfigured until real provider-plan data is supplied.

### Exact next work

The Admin/Data hardening, VPS metrics and GitHub/Handoff workstream is complete. The next code work should start with normalized-domain/database redesign:

1. read `docs/DATABASE_CORE_V2.md` and `docs/DATABASE_PERSISTENCE_AUDIT.md`;
2. choose one business domain;
3. define relational authority, migration/backfill/rollback and capability checks;
4. preserve Browser/UI -> VPS API -> PostgreSQL as the only write authority;
5. keep dedicated transactional APIs for operations whose invariants cannot safely be expressed through generic CRUD.


## 2026-09-19 — Release #754 inventory isolation verified

Inventory hardening is now production-verified.

Evidence:

- commit: `6f391421881e6e4aa687ed8cca85d751f96efadb`;
- workflow: Deploy Kitchen OS to VPS #754;
- run ID: `35430241680`;
- schema: `022`;
- production UI smoke: PASS;
- post-deploy Inventory Site Production Audit #8: PASS.

Pre-migration production audit ran after the database backup and before schema 022:

- stock-site mismatch: 0;
- receive-default site mismatch: 0;
- unknown item-site prefix: 0.

Migration `022_inventory_site_isolation.sql` was then applied successfully. Production verification reported:

- `OK: schema version 022`;
- `OK: inventory site-isolation triggers = 3`;
- release endpoint: `6f39142`.

This confirms the user-reported Fuxing/Yongji “shared quantity” symptom was not caused by cross-site PostgreSQL contamination. The relevant defect was browser cache/site context; schema 022 now also prevents a future frontend defect from writing an item into another site's location.

Current inventory authority:

- Central, Fuxing and Yongji intentionally share one PostgreSQL database.
- They are isolated by site-scoped item/location rows.
- Normal stock edits affect only the active site.
- Cross-site quantity changes require an explicit shipment/direct-transfer transaction.
- Same-site storage movement uses transfer/relocation transactions.
- Browser localStorage remains cache/UI state only.

Immediate continuation:

1. Finish visible warehouse-switch pending feedback.
2. Preserve fetch-before-commit branch switching.
3. Keep Inventory Site Production Audit as a release gate.
4. Preserve schema-022 guards in all future inventory/database work.


## 2026-09-20 — Release #765 verified; schedule read cutover gate in progress

Verified production now is:

- commit: `fc563c7f147327656aff304a0c621754d38b4591`;
- workflow: Deploy Kitchen OS to VPS #765;
- run ID: `35443223746`;
- schema: `022`;
- production UI smoke: PASS;
- Inventory Site Production Audit: PASS;
- Workforce Schedule Production Parity: PASS;
- Workforce Schedule Production Backfill: PASS.

PR #119 is therefore production-verified. Runtime schedule mutations now write through to relational workforce schedule tables inside the same PostgreSQL transaction as the compatibility `business_state.schedule` update. Compatibility JSON is still the read authority; there is not yet a production read cutover.

Current candidate branch:

- `feat/workforce-schedule-read-cutover-gate-20260920`
- base: verified production `fc563c7f147327656aff304a0c621754d38b4591`
- schema change: none
- production behavior change while the flag is absent: none

Candidate purpose:

- add `WORKFORCE_SCHEDULE_RELATIONAL_READ` as a server-side read-authority gate;
- default the VPS compose value to `false`;
- when disabled, `/api/business-state/:site` continues to read schedule from compatibility JSON;
- when enabled, only the schedule module is projected from relational PostgreSQL tables;
- keep existing compatibility module revision tokens for optimistic write concurrency and rollback;
- expose read-authority metadata for diagnosis;
- keep the dedicated relational schedule endpoint read-only;
- regression-test both gate states before any production enablement.

Do not enable the flag in production merely because this candidate merges. Required sequence:

1. CI must pass with the gate default OFF.
2. Deploy the code with the gate still OFF and verify release + production smoke.
3. Re-run production schedule parity/backfill and confirm no divergence.
4. Enable relational read only in a separate reviewed change/operation with a rollback path.
5. Continue compatibility writes until relational read has been stable in production; retirement of compatibility authority is a later explicit stage.


## 2026-09-20 — Inventory hidden-stock production defect confirmed

A deeper read-only production audit was merged as PR #122 and executed as Inventory Site Production Audit #24 / run `35457497470`.

Cross-site integrity remained clean:

- `stock_site_mismatch = 0`
- `receive_default_site_mismatch = 0`
- `unknown_item_site = 0`
- duplicate active catalog/site groups = 0
- invalid/blank catalog identity = 0
- active item without stock/storage configuration = 0
- invalid receive-default configuration = 0

The audit found one real inventory integrity defect:

- `inactive_item_positive_stock = 4` stock rows;
- `inactive_item_positive_minimum = 4` stock rows;
- affected hidden stock belongs to two Fuxing items:
  - `fuxing:duck-tongue`
    - `fuxing-kitchen`: quantity 4 / minimum 10
    - `fuxing-large-fridge`: quantity 14 / minimum 20
    - `fuxing-work-noodles`: quantity 4 / minimum 10
  - `fuxing:freezer-kombu-broth-small`
    - `fuxing-large-freezer`: quantity 40 / minimum 15

Root cause:

- frontend already expected the backend to return `ITEM_HAS_STOCK` when deleting a stock-bearing item;
- backend `POST /api/inventory/catalog/archive` previously performed a direct `active=false` update with no stock guard;
- inventory GET intentionally hides inactive items, so stock stayed in PostgreSQL but disappeared from normal UI/API snapshots.

Active fix branch:

- `fix/inventory-hidden-stock-archive-integrity-20260920`

Candidate fix:

1. migration 023 reactivates only inactive items that still have positive physical quantity; quantity/minimum values are preserved exactly and recovery is audit logged;
2. DB trigger blocks item archive while quantity or minimum configuration remains;
3. DB trigger blocks positive stock/minimum writes against an inactive item;
4. archive API becomes transactional, returns `409 ITEM_HAS_STOCK`, removes only zero-stock configuration/default routing, and writes an audit record;
5. API regression requires archive to fail before stock is cleared and succeed only after quantity/minimum become zero;
6. production data verifier requires schema 023 and zero hidden stock after deploy.

Do not manually delete or zero the affected production quantities. The migration intentionally restores visibility without guessing physical stock.


## 2026-09-20 — Release #774 hidden-stock repair verified; schema 024 candidate

Release #774 is now the verified production baseline.

Evidence:

- commit: `267235bf9d406f84f982d05df10a46a30f937201`;
- workflow: Deploy Kitchen OS to VPS #774;
- run ID: `35458513691`;
- server-side backup: `kitchen_os_20260919T173838Z.dump`;
- migration `023_inventory_archive_integrity.sql`: applied;
- schema: `023`;
- API health/release: PASS;
- production UI smoke: PASS;
- post-deploy Inventory Site Production Audit #31 / run `35458782811`: PASS.

Production after migration 023:

- stock-site mismatch: 0;
- receive-default site mismatch: 0;
- unknown item site: 0;
- inactive item positive quantity: 0;
- inactive item positive minimum: 0;
- inactive location positive quantity: 0;
- inactive location positive minimum: 0;
- invalid receive-default location/config: 0;
- duplicate active catalog/site groups: 0;
- active item without stock rows: 0;
- active item without active storage rows: 0;
- `inventory_hidden_integrity_violations = 0`;
- `inventory_site_integrity_violations = 0`.

The Fuxing hidden-stock repair preserved the database totals and stock rows; it did not zero or delete the affected inventory.

Current candidate branch:

- `fix/inventory-location-archive-integrity-20260920`
- target schema: `024`

Reason:

The location archive API previously blocked only `quantity > 0`. A location with `quantity = 0` but `minimum_quantity > 0` could therefore be archived and hide operational stock configuration.

Schema 024 candidate adds:

1. DB guard blocking location archive while quantity/minimum remains;
2. DB guard blocking positive stock/minimum writes to inactive locations;
3. DB guard requiring receive-default routing to target an active storage location;
4. API archive check for `quantity > 0 OR minimum_quantity > 0`;
5. isolated DB + static regression coverage;
6. production verifier requirement for all three location-integrity triggers.

After schema 024, continue the inventory audit by reviewing `catalog/sync`: any path that changes physical quantity must create the same auditable `inventory_transactions` history as the dedicated set-quantity/transfer APIs.


## 2026-09-20 — Release #776 schema 024 verified; catalog stock authority defect confirmed

Verified production:

- commit: `d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2`;
- Deploy Kitchen OS to VPS #776 / run `35459291983`;
- backup: `kitchen_os_20260919T175402Z.dump`;
- migration `024_inventory_location_archive_integrity.sql`: applied;
- schema: `024`;
- item archive-integrity triggers: 2;
- location-integrity triggers: 3;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- Inventory Site Production Audit #33 / run `35459551373`: PASS;
- Schedule Production Parity/Backfill: PASS.

Audit #33 confirms all current inventory structural checks are zero, including inactive item/location stock, invalid receive defaults, duplicate active catalog/site groups and missing active stock/storage rows.

### Next defect found during write-path audit

`POST /api/inventory/catalog/sync` currently mixes two authorities:

1. catalog/location metadata;
2. physical quantity/minimum writes when the caller has stocktake capability.

The branch/product modal sends quantity/minimum in the same catalog payload. Therefore an admin/supervisor metadata edit can replay stale local stock into PostgreSQL, and the quantity mutation does not create `inventory_transactions`.

A second issue exists in the same route: omitted location associations are deleted when `quantity=0` even if `minimum_quantity>0`.

Active branch:

- `fix/inventory-catalog-sync-stock-authority-20260920`
- schema change: none

Required invariant:

- catalog sync owns metadata + location association only;
- quantity changes use dedicated stocktake API and transaction history;
- minimum changes use dedicated minimum API;
- catalog sync never overwrites existing quantity/minimum;
- new associations start at 0/0;
- omitted associations may be deleted only at quantity=0 and minimum=0;
- protected omitted locations return conflict rather than silently losing configuration.

Historical quantity changes performed through the old catalog path cannot be reconstructed reliably because that path did not emit inventory transactions. Do not guess corrective stock values; current physical quantities must be validated by normal stocktake if operationally questioned.


## 2026-09-20 — Release #783 catalog authority verified; Super Admin lifecycle gap

Release #783 is the verified production baseline.

Evidence:

- commit: `5bc9d92e878510c0646acced2b8070750778529c`;
- Deploy Kitchen OS to VPS #783 / run `35475816625`;
- server backup: `kitchen_os_20260919T232353Z.dump`;
- schema remains `024`;
- preflight/API/concurrency/browser/full-device: PASS;
- production UI smoke: PASS;
- `DATA_INTEGRITY_OK`;
- Inventory Site Production Audit #40 / run `35476066953`: PASS;
- exact release: `5bc9d92`.

Production inventory totals remained unchanged:

- central: 71;
- fuxing: 1792;
- yongji: 6.

All audited structural violations remain zero.

### Next integrity gap

Super Admin Data Tables & CRUD exposed `inventory-products` as a generic lifecycle dataset.

Although `item_key` and `catalog_key` are create-only, generic CRUD could still:

- create an active inventory item without any stock/storage association;
- toggle `active` outside Inventory lifecycle;
- archive an item without the dedicated cleanup of zero stock associations and receive-default routing.

Active branch:

- `fix/super-admin-inventory-lifecycle-20260920`
- schema change: none

Required invariant:

- Super Admin generic CRUD may inspect and edit safe metadata for an existing inventory item;
- item create/reactivate/archive belongs only to Inventory lifecycle APIs;
- `active` is not a generic editable field;
- frontend must not show create/archive controls for `inventory-products`;
- backend must enforce the same policy even if called directly.

After this slice, continue with minimum-change history/audit semantics and remaining non-quantity inventory mutations.


## 2026-09-20 — Live GitHub & Handoff workstream

Production baseline before this workstream:

- release: `60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c`;
- Deploy Kitchen OS to VPS #786 / run `35482680596`: PASS;
- schema: `024`;
- production UI smoke: PASS;
- Inventory Site Production Audit #44 / run `35482912054`: PASS.

Active branch:

- `feat/live-github-handoff-20260920`
- schema change: none.

### Handoff authority change

The canonical entry point for another developer or a new ChatGPT conversation is:

- `https://vial1307.github.io/restaurant-management-system-demo/handoff.html`

Expected continuation order:

1. Open the canonical Live Handoff URL.
2. Read the active PR title/body, branch, head SHA, changed files and CI shown there.
3. Read `docs/CURRENT_HANDOFF.md`.
4. Read `docs/WORK_LOG.md`.
5. Read `docs/DEVELOPMENT_RULES.md`.
6. Continue only from the active PR/head shown by Live Handoff.

The VPS Super Admin `GitHub & Handoff` section now has a server-side live GitHub feed design:

- latest open PR becomes current work automatically;
- current branch/head SHA come from GitHub;
- PR body becomes the current fix/stopping-point description;
- changed files become code focus;
- recent commits form the current development chain;
- workflow runs are filtered to the exact active PR head SHA;
- production release/schema still come directly from the running VPS;
- GitHub metadata is cached briefly and falls back safely if GitHub is unavailable;
- GitHub Actions CI uses deterministic fallback so tests do not depend on external API availability.

The public `handoff.html` page is intentionally limited to public repository metadata. It contains no VPS credential, database secret, SSH key or private operational data.

### Next known work after Live Handoff

The next inventory integrity slice already identified is `set-minimum` history/audit semantics: minimum changes currently update `inventory_stock.minimum_quantity` but do not create an `inventory_transactions`/audit history record. Do not mix that fix into the Live Handoff PR.


## 2026-09-20 — Live Handoff production verified; minimum-history slice

Live GitHub & Handoff is now production verified.

Production evidence:

- merge/release SHA: `19feaa88744939eba6c6b28cdcc57b290ad72029`;
- Deploy Kitchen OS to VPS #789 / run `35495483199`: PASS;
- schema: `024`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- GitHub Pages build/deploy #927: PASS;
- Inventory Site Production Audit #47 / run `35495707381`: PASS;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- exact release check: `19feaa8`.

Canonical continuation entry remains:

- `https://vial1307.github.io/restaurant-management-system-demo/handoff.html`

### Active inventory slice

Branch:

- `fix/inventory-minimum-history-20260920`
- schema change: none; remains `024`.

Confirmed defect:

- `POST /api/inventory/set-minimum` changed `inventory_stock.minimum_quantity`;
- the mutation did not create `inventory_transactions`;
- the Inventory History view therefore could not show who changed an item minimum, when it changed, or its before/after values.

Candidate invariant:

- minimum changes are transactional;
- stock row is locked before reading the previous minimum;
- no-op save does not create duplicate history;
- real change writes `inventory_transactions.action='adjust'`;
- metadata uses `operation='set_minimum'`, `before_minimum`, `after_minimum`;
- increase/decrease anchors the same location through destination/source so existing site history query includes the event;
- frontend maps this metadata to a distinct `minimum` history direction;
- UI label is `標準量調整 / Điều chỉnh định mức`;
- no schema migration is needed because the existing `adjust` transaction action contract is reused.

Dynamic regression uses a zero-minimum fixture to prove:

1. `0 -> 4` creates history;
2. `4 -> 4` creates no duplicate history;
3. `4 -> 0` creates the second history event;
4. admin History API returns actor/location/before/after correctly.


## 2026-09-20 — Minimum history production #793; receive-default audit slice

Minimum-history work is production verified.

Production evidence:

- PR #129 merged as `ccef35dad7027808d60b3a691925fbebc29b9eb4`;
- Deploy Kitchen OS to VPS #793 / run `35496998332`: PASS;
- schema: `024`;
- server backup: `kitchen_os_20260920T073331Z.dump`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- GitHub Pages #928: PASS;
- exact release: `ccef35d`.

Inventory Site Production Audit #51 / run `35497249172`:

- first attempt failed before SQL audit because SSH was reset by the VPS (`kex_exchange_identification: Connection reset by peer`);
- rerun succeeded without code/data change;
- `stock_site_mismatch = 0`;
- `receive_default_site_mismatch = 0`;
- inactive item/location positive quantity/minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site groups = 0;
- active items missing stock/storage rows = 0;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- exact release check: `ccef35d`.

### Active inventory slice — receive-default audit

Branch:

- `fix/inventory-receive-default-audit-20260920`
- schema change: none; remains `024`.

Confirmed gap:

- `POST /api/inventory/receive-default` stored only the latest `updated_by` / `updated_at`;
- changing A -> B overwrote prior context;
- deleting a receive-default removed the routing row and its actor context entirely;
- no persistent before/after audit existed for direct receive-default edits.

Candidate invariant:

- create/update/delete run inside one DB transaction;
- an advisory transaction lock serializes the same `site + catalogKey` even when no receive-default row exists yet;
- an existing receive-default row is also locked before change;
- no-op set and no-op delete change nothing and create no audit;
- real changes write `audit_logs.action='inventory_receive_default_change'`;
- `entity_type='inventory_receive_default'`;
- `entity_id='site:catalogKey'`;
- before/after store `location_id` and `location_code`;
- metadata stores `catalog_key` and operation `create/update/delete`;
- physical inventory history remains separate because receive-default is routing configuration, not stock movement.

Dynamic API regression uses a dedicated two-location fixture and verifies exactly three audit rows:

1. create default -> audit create;
2. save same location -> no audit;
3. update location -> audit update;
4. delete default -> audit delete;
5. delete again -> no audit.


## 2026-09-21 — Receive-default audit production #796; catalog audit slice

Receive-default audit is production verified.

Production evidence:

- PR #130 merged as `21d376295b6194e48bfaa599fc6c5424256a6196`;
- Deploy Kitchen OS to VPS #796 / run `35500763361`: PASS;
- schema: `024`;
- backup: `kitchen_os_20260920T085648Z.dump`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- GitHub Pages #929: PASS;
- Inventory Site Production Audit #54 / run `35500993290`: PASS;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- exact release check: `21d3762`.

### Active inventory slice — catalog configuration audit

Branch:

- `audit/inventory-config-next-20260921`
- schema change: none; remains `024`.

Confirmed gap:

- `POST /api/inventory/catalog/sync` changed item metadata and storage associations without a durable audit row;
- prior values for name/unit/work area/storage-only/catalog key/location associations were overwritten;
- repeated no-op saves still executed the item upsert path.

Candidate invariant:

- catalog sync runs in one transaction;
- same `itemKey` writes serialize through a transaction advisory lock;
- existing item row is locked before comparison;
- item metadata is updated only when values actually change;
- before/after snapshots include item metadata and configured site location codes;
- real create/update writes `audit_logs.action='inventory_catalog_change'`;
- `entity_type='inventory_item'`;
- `entity_id=item_key` for searchable audit history;
- metadata stores `item_key`, `catalog_key`, and operation `create/update`;
- no-op save creates no audit;
- request quantity/minimum remain ignored by catalog sync;
- new location associations are always created with quantity=0 and minimum=0;
- protected omitted associations with quantity/minimum > 0 remain blocked.

Dynamic API regression verifies:

1. create catalog item -> audit create;
2. identical save -> no audit;
3. metadata + location update -> audit update;
4. Super Admin Audit returns exactly two rows for that item key;
5. quantity/minimum stay zero despite non-zero values supplied in catalog payload.
