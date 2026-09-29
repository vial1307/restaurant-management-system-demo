# Kitchen OS Engineering Status

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
