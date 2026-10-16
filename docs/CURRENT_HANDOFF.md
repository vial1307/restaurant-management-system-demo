## IN PROGRESS — Finance spreadsheet-based scenario decision engine (2026-10-17)

- **PR:** [#252](https://github.com/vial1307/restaurant-management-system-demo/pull/252), branch feat/finance-scenario-sheet-20261017; depends on salary-to-bill PR #250. Production remains UNCHANGED until all CI and release gates pass.
- **Goal:** Salary-to-payment cashflow operating worksheet, 3/6/12-month scenario cells for expenses, extra earnings, goal saving and mandatory paired temporary borrow/repay, exact TWD liquidity and minimum extra income per payday.
- **2026-10-17 methodology note requested:** Renamed workbook navigation **Mô phỏng & Tư vấn**, added a user-expandable **Phương pháp tính & nguyên tắc tư vấn dòng tiền** section showing seven decision rules and each implemented-vs-future boundary. Added 320/390/1440 browser regression for disclosure, default compact mode and keeping the panel expanded after preview. Code change only in PR #252 until all gates pass.
- **Persistence:** Isolated Finance PostgreSQL-only migration 004, owner-scoped audited scenario workbooks; mock loans and planned expenses NEVER post actual money.
- **Sources:** Actual TWD wallets + expected monthly cashflows, net debt fund allocations, goal allocations and external remittances. Warnings for unknown debt due dates, unreconciled expected payments, non-TWD liabilities, incomplete periodic schedules.
- **Acceptance:** Isolated Finance migration twice, real owner API RBAC/CRUD, 1440/390/320px browser, staging, Super Admin + Kitchen regressions, gated deployment and private owner-data verification.
- **Known gaps:** Recurring creditor calendar and minimum payment/interest, forecast reconciliation, adaptive goal contribution during expensive months and background push notifications remain Issue #251. Do NOT portray scenario total as fully certain.
- **Specification:** [Finance workbench design & engineering contract](docs/spec-deltas/2026-10-17-finance-decision-workbench.md).

## DONE — Finance 30/60/90-day liquidity and cashflow adviser (2026-10-17)

- **Release:** [PR #249](https://github.com/vial1307/restaurant-management-system-demo/pull/249) merged into `main` at exact commit `3e5956816ffc72f06adf64f39ef6dcfd24a27809`. Official independent Finance site: https://finance.82.47.180.185.nip.io/ .
- **Production evidence:** [VPS deploy run 38943891429](https://github.com/vial1307/restaurant-management-system-demo/actions/runs/38943891429) **SUCCESS** (preflight, full device regression, exact SHA deploy, post-deploy Finance Chromium smoke). `/RELEASE = 3e59568`, Kitchen `/api/health` app/database OK and schema 036; `DATA_INTEGRITY_OK`, Finance container healthy and activated, encrypted backup + restore rehearsal `FINANCE_ENCRYPTED_BACKUP_AND_RESTORE_PASS`; Finance migrations 001, 002 and 003 recorded. Finance own hostname root and `/finance.html` return HTML and CSS/JS 200; anonymous Finance API 401; 1440px/390px login `FINANCE_PUBLIC_LOGIN_RENDER_PASS`. Code also passed separate Finance Chromium 320/390/1440 with advisor controls and isolated PostgreSQL/owner RBAC.
- **Features:** `Tư vấn dòng tiền` tab, read-only owner-scoped `GET /api/finance/advisor?days=30|60|90&bufferTwd=...`, chronological daily liquidity forecast and balance after events, optional reserve threshold, first shortfall and cash-rotation suggestions. Data derives from actual recorded TWD wallet balances and planned monthly income/expenses, debt funds less posted debt payments, goal funds, and planned outbound TWD remittances. Native foreign wallets and unconvertible foreign outbound transfers flagged instead of invented FX. Estimated or past-due entries flagged. No automatic transactions or recommendation-driven writes.
- **Acceptance caveat:** Production smoke checks the public login and anonymous denial, **not** authenticated owner's actual private persisted data. Owner-login + real-source financial planning/data acceptance must be conducted with the user's own unshared Finance session. An unreachable DNS from some test environments is not evidence the site is offline; GitHub Actions checked the actual VPS deployment.
- **Unrelated operations:** After the release, five Kitchen inventory/workforce post-deploy audit jobs failed reading root-restricted `/opt/kitchen-os/.env` (permission denied). Track separately in [Issue #247](https://github.com/vial1307/restaurant-management-system-demo/issues/247); **do not** weaken secret permissions or conflate these with Finance release quality.
- **Next Finance acceptance:** From authorized owner session, verify `Tư vấn dòng tiền` displays actual posted TWD bank/cash balances and imported monthly flows; change horizon/buffer; edit source `Kế hoạch` and `Mục tiêu & Nợ`, refresh F5 and confirm projected events changed; verify mobile; reconcile predicted income/expenses already settled to avoid duplicate forecast. Never ask users to expose account credentials or sensitive finance exports.

## ARCHIVED — Private Finance rolling cashflow advisor (2026-10-17)

- Branch `feat/finance-rolling-cashflow-advisor-20261017` from main `a5e66f3d`, PR pending. Prior goal/debt planning PR #248 is merged and passed exact-head CI. Runtime version pending production verification.
- User asks for date-based adviser using all planned inflows/outflows, goals/debts and fund rotation. Implement owner-only advisory API and responsive UI driven by the same private Finance PostgreSQL source of truth, without a new data store or automatic money movements.
- Monthly planned cashflow, debt/goal allocations, TWD outbound remittances and current TWD wallet ledger balances are inputs. Non-TWD balances are **not** silently converted. Warning on unknown/estimated dates or unreconciled expenses. Detect first liquidity gap against selectable buffer, provide practical next actions.
- STATUS: IN PROGRESS / NOT DEPLOYED. Release gate exact-head DB/API, browser, cross-device regressions and VPS production integrity.

## ARCHIVED — Finance Planning ↔ Goals/Debts cashflow synchronization (PR #248 DONE; production schema 003)

- Branch `fix/finance-goals-debts-cashflow-sync-20261017`; baseline main `6ac78c659757d81ce9f7d4c4a891849cbc8deaae`; prior production `b5c074c` (Finance schema 002).
- User reports Kế hoạch and Mục tiêu & Nợ are not synchronized in cashflow. Implement goal monthly fund allocations and account for them alongside existing debt allocations in one PostgreSQL projection; display unallocated goals/debts, no invented monthly payment schedule.
- New migration 003, owner-only API, UI shared monthly state, F5 and permission tests. Do not modify Kitchen DB or production Finance data until green exact-head CI/release.
- Status: IN PROGRESS / NOT YET PRODUCTION VERIFIED.

## DONE — Finance monthly cashflow & debt repayment fund (2026-10-17)

- **Production completed:** Finance OS https://finance.82.47.180.185.nip.io/ ; PR [#246](https://github.com/vial1307/restaurant-management-system-demo/pull/246) merged as exact release `b5c074c1abfe05035997acb01c9b76a36dce0cad`.
- **Production evidence:** [Deploy Kitchen OS run #38927345256](https://github.com/vial1307/restaurant-management-system-demo/actions/runs/38927345256) conclusion **SUCCESS** (preflight, full-device Kitchen regression, exact-SHA VPS deploy and public Finance Chromium smoke). VPS `/RELEASE` confirmed `b5c074c`, Kitchen API health DB schema 036 `ok`, `DATA_INTEGRITY_OK`, `FINANCE_DB_AND_APP_ACTIVATED`. Finance separate PostgreSQL **migration 002_finance_cashflow_debt_fund** applied 2026-10-16 16:01:42 UTC on VPS, retained schema 001. `FINANCE_ENCRYPTED_BACKUP_AND_RESTORE_PASS`.
- **Frontend verified live:** HTTPS root `/` and `/finance.html` both delivered full HTML login; /src/personal-finance.css and .js both HTTP 200; anonymous /api/finance/bootstrap, /overview and **/cashflow** returned **401** as intended; restaurant inventory endpoint inaccessible from Finance hostname 404. Real Chromium Desktop 1440px + mobile 390px output `FINANCE_PUBLIC_LOGIN_RENDER_PASS`. The Finance UI regression also tested 320/390/1440 with authenticated browser mocks and F5 persistence.
- **Functionality:** owner-scoped monthly planned income/expense add/edit/delete, month/year forecast and planned-vs-actual net; per-debt monthly planned/earmarked fund, manual FX snapshot for non-TWD, actual debt payments from same-currency owned wallet with balances, principal+interest+fee posting and reduced debt outstanding. Financial event, ledger entry and debt payment immutable; guarded by idempotency and audit records; no actual bank transfers/FX feeds.
- **Security boundaries:** Finance database and schema isolated from restaurant DB. Finance authorization still uses an expressly allowlisted Kitchen OS user identity; the **actual production owner-login and private end-to-end read/write workflow has not been exercised using the owner's credentials**. Only anonymous access-denial and front-end login rendering were live-smoke tested; authenticated DB API and F5 flows were validated in isolated CI. For sensitive data, switch to an unshared owner identity.
- **Outcome:** DONE for code, database migration, deployment and public UI checks. Optional follow-up: actual authorized owner production acceptance, recurring cashflow templates and automated bill reminders in later PR; no additional changes required to make initial cashflow/debt fund usable.

## ARCHIVE — Finance OS reliability and planning modules (PR #245; completed)

ACTIVE_PR: #245
- PR: https://github.com/vial1307/restaurant-management-system-demo/pull/245. Branch: `fix/finance-superadmin-contract-audit-20261016`, based on main `afed444`. Baseline Finance production: https://finance.82.47.180.185.nip.io/ (root white-screen fix already verified).
- Goal: meet `docs/ENGINEERING_CONTRACT.md` and `docs/VERIFICATION_MATRIX.md` without touching restaurant inventory/business tables.
- Implementing: fixed ordered account locks, per-form idempotency and save-read failure semantics, owner-only goals/debts, manual goal progress, FX-plan cancellation, atomic `finance.audit_events`, five-tab responsive UI.
- Tests: finance DB API RBAC and audited writes, transfer concurrency, mobile/desktop forms, persistence after F5, Super Admin isolation, Kitchen regression/Staging. Owner login remains explicitly allowlisted Kitchen identity. No official live FX feed or bank transfer.
- **STATUS: CI / PRODUCTION NOT YET VERIFIED FOR PR #245**. Do not claim live new features before exact-head gates, merge, deploy and production smoke.

## FIXED — Finance OS blank white screen on website root (2026-10-16)

- **Public URL fixed and verified:** https://finance.82.47.180.185.nip.io/ now serves complete Finance OS login HTML rather than empty HTTP 200 (zero bytes). Direct `/finance.html` also works.
- **Root cause:** Caddy `handle / { redir /finance.html 302 }` produced an empty response for the Finance hostname. Replaced with explicit `root * /srv`, `rewrite * /finance.html` and `file_server`.
- **PR #244 merged** (squash commit `88831b1c69e346464546623337f9150a43b7e3da`). Staging, PostgreSQL, Caddy validation and restaurant-wide regressions all passed.
- **Production evidence:** [GitHub Actions run 38904666472](https://github.com/vial1307/restaurant-management-system-demo/actions/runs/38904666472), production deploy and desktop/mobile Chromium smoke PASSED. Real anonymous Chromium confirmed on 1440px and 390px: HTTP 200 with ~3 KB HTML, visible login form, CSS and JavaScript 200 and expected anonymous Finance API 401. Final marker `FINANCE_PUBLIC_LOGIN_RENDER_PASS`.
- Finance personal PostgreSQL remains activated and isolated; this change only fixes Finance domain root routing and enhances production smoke. No restaurant database or financial ledger data altered.
- Authenticated customer finance save/read after login still requires separate private account acceptance check, not covered by anonymous login smoke.

## DONE — Personal Finance OS độc lập trên VPS (2026-10-16)

- **Website production:** https://finance.82.47.180.185.nip.io/ — giao diện đăng nhập tài chính độc lập khỏi đường dẫn nhà hàng. Homepage chuyển sang `/finance.html`; các trang tài chính hỗ trợ mobile/desktop. **Nguồn chuẩn:** main và CURRENT_HANDOFF.md.
- **PR #243 MERGED** [squash commit `510aaac57022ec013edf2f1c2b234381fae868cf`](https://github.com/vial1307/restaurant-management-system-demo/commit/510aaac57022ec013edf2f1c2b234381fae868cf). Workflow CI Finance DB/API, Finance UI, Super Admin, Staging và Kitchen regression PASS.
- **VPS production verified** on follow-up release `a495474e2efeea42b6ed38ead2e0ff1622fdc8f1`: [Deploy Kitchen OS run 38880962591](https://github.com/vial1307/restaurant-management-system-demo/actions/runs/38880962591) **PASS** including `production-ui-smoke`. Direct HTTPS Finance shell verified; anonymous `GET /api/finance/access` returns **401**; request for Kitchen inventory endpoint through Finance hostname returns **404**; restaurant release check PASS.
- **Finance Database ACTIVATED** — PostgreSQL 16 container `kitchen-finance-db`, distinct persistent volume `kitchen-os_finance_postgres_data`, schema `finance` migration `001_personal_finance`; no changes to restaurant inventory or its PostgreSQL tables for Finance. Database confirmed healthy in deploy log.
- **Finance backup verified:** encrypted backup + independent restore rehearsal returned `FINANCE_ENCRYPTED_BACKUP_AND_RESTORE_PASS`, scheduled root daily backup retained 14 days; encryption key stays on VPS. This is not off-site disaster recovery: secure external copy of backup + key remains an operational recommendation.
- **Scope now live:** accounts and opening balances, income/expenses, monthly/yearly budget summaries, multi-currency TWD/VND/USD/JPY/EUR/CNY, own-account FX ledger and separate *planned* FX/remittance calendar. Plans do not execute bank transfers or affect balances until posted; rates are manually entered, NOT live.
- **Identity note:** Finance origin has its own login form and host-only `Secure; SameSite=Strict` session cookie, but account authentication currently relies on the **existing Kitchen OS app_users** record explicitly authorized by `FINANCE_OWNER_USER_ID` (initial provision pinned to active `yangchuadmin`). Only that authorized account can access finance data. If the identity is shared, migrate to a private dedicated owner account before entering sensitive data. Production smoke verified anonymous denial, not an authenticated, live user read/write/refresh round-trip; that last user-level acceptance check is still recommended.
- **One-link handoff:** https://vial1307.github.io/restaurant-management-system-demo/handoff.html. PR #243 is merged; main is authoritative for future finance continuation.

## DONE — Procurement manual quantities, DB-persisted draft forms and literal search deployed (2026-10-12)

- **Production verified:** exact runtime `a22cfbf3b61a855e468b0481c981b70477acc550` (short `a22cfbf`), PostgreSQL schema `036`. [PR #241](https://github.com/vial1307/restaurant-management-system-demo/pull/241) squash merged. Main Staging `38157179600` PASS; gated production preflight/full browser regression/deploy/Production UI smoke `38157246580` PASS. Production `GET /api/health` log: `app=ok, database=ok, schema=036, release=a22cfbf, environment=production`. VPS pre-deploy backup `/opt/kitchen-os/backups/kitchen_os_20261011T170107Z.dump`; database integrity errors `0`.
- **User problem fixed:** product checkboxes and manual quantities on Procurement no longer depend on a configured supplier or forecasting rule. Enter a positive whole number in item quantity (auto-selects item), or select manually, then use the action in the summary. For a mixed/unconfigured selection it explicitly says **儲存叫貨草稿 / Lưu phiếu nháp**; authorized API `POST /api/procurement/:site/drafts` validates site/item/quantity and persists an audited, idempotent `procurement_order_drafts` record. Drafts are shown in Procurement History with real Inventory names/units; they are **NOT orders sent to suppliers**, do not modify physical Inventory, and do not imply supplier assignment. For entirely eligible selections, the existing guarded supplier-order flow remains intact.
- **Search fixed:** consistent literal substring of active site's `name_vi` or `name_zh_tw` (NFC, accents preserved); no phonetic/initial guessing, no `ca`->`cá` alias. On list/supplier/group/settings rows, typing updates visible DOM rows and match count/no-results while keeping focus/caret, tab, chosen quantities and selected items; inline `display:none` prevents styles from redisplaying `hidden` rows. Desktop and Mobile share implementation.
- **Evidence:** PR exact tested head `34cf9a96612c09bd148ef64f54372a31b8244d98` passed isolated Staging `38156304020`, schema CI, and full PR workflow `38156304063` attempt 2 after an unrelated Workforce-login timeout in attempt 1; Procurement browser test itself passed both times. The browser regression confirms positive quantity enabling, draft POST 200 + ID, readback in History, literal search zero-result/reset on 1440px/390px. Main CI / Production `38157246580` PASS.
- **Remaining operator/business setup:** six Fuxing vendors exist but product→supplier mappings / vendor closures remain unverified; unconfigured items remain drafts rather than submitted supplier orders. `1 盒 ≠ 1 包` (not converted). Existing Warehouse-linked `安全庫存` with optional custom mode unchanged. No live manual session test on user's browser was performed after deploy; production smoke was automated. `ACTIVE_PR: none` for this completed release.
- Old `IN PROGRESS` sections below are historical, superseded by this DONE header.

## IN PROGRESS — Procurement manual quantity + persisted forms and literal search (2026-10-12)

- **ACTIVE_PR: pending** for branch `feat/procurement-manual-drafts-literal-search-20261012`. Operator reported they cannot click Create Form or edit quantity, and product-name search still behaves incorrectly.
- Root causes verified in `src/procurement-v2-components.js` and `src/procurement-v2.js`: checkbox/number input were `disabled` unless `rule.enabled && supplier && plan.canOrder`, and Create Form included only configured lines. This blocks a manual purchasing workflow at Fuxing where six suppliers exist but zero product associations were verified.
- New **additive migration `036_procurement_manual_drafts.sql`** and authenticated `POST /api/procurement/:site/drafts` for manual, **audited, idempotent, PostgreSQL-persisted draft forms** referencing the site's real Inventory item IDs and original units. Manual quantities and selections work without assigned vendor; when ALL chosen lines are verified supplier orders, the existing guarded `/orders` flow remains unchanged. Otherwise the UI clearly labels and saves a DRAFT, **not an order sent to the supplier**. Draft history is shown using the authoritative site-scoped API. No physical stock mutation, supplier assignment, manual item list, quantity seed or 盒↔包 conversion.
- Search is **literal only** for current Inventory item's `name_vi`/`name_zh_tw`; case insensitive, NFC, Vietnamese tone preserving, no pinyin/zhuyin/initials. Fixes live hiding with author-level `display:none` plus no-results indicator and visible count, without replacing focused input or losing manual quantity selections. Same components across list/supplier/group/settings and Desktop/Mobile.
- **NOT LIVE until** PR exact-head schema/CI/browser, isolated Staging, merge exact HEAD, main Staging, guarded VPS deploy, Production UI smoke + post-deploy health pass. Production authority at last verified release `295b9f6`, schema `035`. Avoid asserting the draft feature is deployed before these gates.
- NEXT: run/fix all PR tests, then certify Production, update all 3 handoff docs to DONE. Historical completion of vendor-name issue remains valid.

## DONE — Procurement supplier names repaired in Production + safety mode remains LIVE (2026-10-11)

- **PRODUCTION PASS / VERIFIED:** Exact runtime release `295b9f61e1e3305b74f0676f1f6e847e5e785436` (short `295b9f6`), PostgreSQL schema `035`. PR [#239](https://github.com/vial1307/restaurant-management-system-demo/pull/239) merged, main Staging run `38083595035` PASS, gated Production deploy/DB regression/full browser/Production UI smoke workflow `38083657473` PASS, after deploy `GET /api/health` returned `app=ok, database=ok, schema=035, release=295b9f6, environment=production`. VPS backup `/opt/kitchen-os/backups/kitchen_os_20261010T203201Z.dump`.
- **Root cause fixed:** Procurement's supplier-name UI read `name_zh_tw/name_vi` even though `GET /api/procurement/:site` returns `nameZhTw/nameVi`. The operator screenshot showed only `·` for Fuxing suppliers. Shared escaped `procurementSupplierName()` now handles API camelCase, optional Vietnamese aliases and Chinese-only names correctly across product modal supplier selector, supplier cards, filter, grouping, order history and summary on Desktop/Mobile. Inventory item/category snake_case names intentionally remain untouched.
- **Regression evidence:** Chinese-only vendor `聯興`, bilingual vendor and XSS unit tests; CI Desktop/Mobile browser test persisted/read back supplier and confirmed real names in product selector and no separator-only choices. One test fixture initially asserted exactly one name although dual viewport runs created two identically named testing records; corrected to validate all option labels. Exact tested PR head `7d970b23de5e9e866428e8bcff1106c92678d023` passed isolated Staging `38083026712` and full PR pipeline `38083026788` before merge. Production UI smoke passed, but this does not claim a fresh manual screenshot of the actual end-user's browser after deployment.
- **Data safety:** UI fix did NOT modify supplier/inventory/product records, safety minimums, stock quantities, conversion rules, closures, item-vendor links or purchase orders. Six active Fuxing supplier names (`聯興`, `濱江`, `津鼎`, `寶綠`, `漁鴻`, `南門`) were already registered in audited Production run `38074558198`, with **no verified product-supplier assignments**.
- **Safety stock LIVE:** The previous Procurement feature PR #238 was deployed at `d18d28c`, migration `035`, production workflow `38076014722` attempt 2 PASS. Default `安全庫存` reads the live sum of configured enabled Inventory location minimums; each item has a `custom` override that users may select later. The supplier-display fix leaves this behavior in place. Fuxing `三記魚餃` `臥櫃` minimum 10 `盒` remains as verified.
- **NEXT separate tasks:** Supplier-specific actual product mapping, closure exceptions, Thursday holiday confirmations, unit `盒` vs `包` conversion for egg dumplings; no guessed assignments/orders. Future screenshot checks may be done by operator in newly refreshed session. `ACTIVE_PR: none` for this completed UI workstream. Earlier `IN PROGRESS` sections below are historical and superseded by this closure.

## IN PROGRESS — Fix Procurement supplier display contract after live screenshot (2026-10-11)

- **ACTIVE_PR: pending** for `fix/procurement-supplier-api-name-fields-20261011`. Operator screenshot of Production Procurement product modal proved the saved Fuxing supplier dropdown displayed only `·` instead of actual vendor names.
- **Root cause confirmed from repository source:** `vps/backend/src/procurement-routes.mjs` serializes Supplier DB `name_zh_tw/name_vi` into API **`nameZhTw/nameVi`**, while several UI components wrongly rendered `supplier.name_zh_tw/name_vi`. These undefined fields produced a separator-only option and blank supplier cards/filters. This is NOT missing supplier data or a PostgreSQL encoding problem.
- Fix uses a single escaped, read-only `procurementSupplierName()` display adapter sourced from API camelCase fields. If a vendor has only Chinese name, show it alone; if Vietnamese alias also exists, show bilingual names without blank separators. Update product-settings supplier dropdown, site supplier lists/cards, filtering, grouping, product cards, order history, and side summary; **do not rename Inventory item/category `name_zh_tw/name_vi` fields** (they legitimately use snake_case). Regression: Chinese-only `聯興`, bilingual fixture, XSS escaping, Desktop/Mobile browser must see vendor names after authenticated API save.
- **Baseline successfully deployed to Production:** `main d18d28c`, schema `035`, deploy & Production UI smoke PASS in workflow `38076014722` attempt 2. First attempt blocked by transient 320px login failure, no deploy; rerun passed all gates. Procurement safety defaults to Inventory minima with optional manual override. Six active Fuxing supplier names were created earlier in Production by ops run `38074558198`, and are not being inserted again.
- Scope of this PR is **presentation/tests/docs only**; no database migration, row mutation, supplier mapping/closure inference, inventory change, or new purchase orders. Need exact-head PR CI, staging, main CI and post-merge production smoke to close.
- Still pending verified supplier-product relationships, closure/day policies, and 盒/包 conversion for egg dumplings; do not guess. Old sections below are prior-history snapshots.

## IN PROGRESS — Procurement safety derives from Inventory minima; Fuxing supplier names registered (2026-10-11)

- **ACTIVE_PR: pending** for `feat/procurement-inventory-minimum-as-safety-20261011`; NOT deployed yet. User requested Procurement's safety stock use the existing Inventory minimums until they explicitly choose a manual override. Implementation adds migration `035`, persisted `safety_stock_mode = inventory | custom`, Inventory read-only sum of *configured and enabled* item-location `minimum_quantity`, and effective safety value passed into actual purchase planning. Same logic for all sites and both Desktop/Mobile. No duplicated stock table, no cached hardcoded quantities and no implicit 盒/包 conversion.
- **Fuxing supplier names are already in Production Database**, six confirmed active rows `聯興`, `濱江`, `津鼎`, `寶綠`, `漁鴻`, `南門` created and verified by guarded one-time workflow `38074558198` (PASS), backup `/opt/kitchen-os/backups/kitchen_os_20261010T180821Z.dump`. Each had 0 linked product rules in post-write audit; no supplier calendars verified, no default closure inferred from Thursday/Sunday statements. The initial attempt `38074448231` failed at SQL UUID aggregate before writing; the corrected run passed after a fresh backup.
- Supplier registry is an **operational data change**, not a new runtime release. At last verified check production runtime remains `13c1ceb`, PostgreSQL schema `034`, health app/database OK. The safety-mode code and migration `035` still REQUIRE successful exact-head PR/Staging tests and guarded production deploy before DONE.
- Existing Fuxing `三記魚餃` second-floor freezer minimum **10 盒** and physically stocked **0 盒** were verified by previous guarded workflow `38073984898`; the new Procurement safety source will read these live values plus other enabled configured minima. Nothing in this branch adjusts physical stock or minimums, assigns supplier-product relationships, or creates actual orders.
- **NEXT:** certify regression for Inventory-linked safety and explicit custom override, bilingual desktop/mobile, permissions/DB migration, Staging exact HEAD and Production deployment; verify mode + supplier registry via API on fresh sessions. Keep product/vendor mappings and supplier actual closed days pending operator verification. Earlier historical BLOCKED documentation is superseded only as to the six supplier name records, not their calendar/product associations.

## DONE — Fuxing 三記魚餃 臥櫃 (second-floor freezer) minimum stock = 10 盒 (2026-10-11)

- Operator confirmed `臥櫃 10 盒` means **maintain minimum 10 boxes** of `三記魚餃` in Fuxing's **second-floor freezer** `inventory_locations.code='fuxing-lengdongerlou'`; this is NOT an automatic order and does NOT authorize changing stock quantity.
- **Production Database correction APPLIED and verified.** One-time guarded GitHub Actions workflow `38073984898` PASS. Exact item `fuxing:freezer-sanji-fish-dumpling` / `三記魚餃` / unit `盒`, exact location `fuxing-lengdongerlou` checked. Precondition minimum `20.000 盒`, physical quantity `0.000 盒`; changed **only minimum `20 → 10 盒`**, `minimum_enabled=true`. Post-write reread: `VERIFIED_MINIMUM|...|10.000|0.000|true`. Work `海鮮區` remained **quantity 0 盒 / minimum 1 盒**.
- Safeguards: exact VPS release `13c1ceb` and schema `034`; backup `/opt/kitchen-os/backups/kitchen_os_20261010T175959Z.dump`; transaction with row lock, stale-value guard (only 20→10 or no-op at 10), existing `inventory_transactions` audit with before/after metadata and stock-unchanged assertion; post-write Production API health `app=ok,database=ok,release=13c1ceb,schema=034`.
- Earlier unsuccessful workflow `38073953553` stopped at an invalid backup script path **before any write**. Follow-up workflow `38073984898` used the verified backup path and passed all steps. No runtime application deploy or schema migration occurred; this was a one-time authorized operational database adjustment, **not** a new release.
- **Still unresolved:** SOP `海鮮台 10 盒` has NOT been applied (work location minimum remains 1 盒); Fuxing `豬肉蛋餃` / `牛肉蛋餃` SOP counts are in `盒` while DB units are `包`, with no conversion; supplier identities/calendar mappings unverified. Never copy `盒` quantities into `包` rows or infer a vendor association.
- **NEXT:** verify whether `海鮮台 10 盒` is also a standing minimum, then (only if approved) use site-scoped minimum edit/audited ops; supplier/entity mapping remains a separate verified workstream. `ACTIVE_PR: none` for production runtime work. Prior BLOCKED documentation sections below are historical and superseded by this specific completed record.

## CONFIRMED — Fuxing 臥櫃 location identity and distinct 盒/包 units (2026-10-11)

- **Operator-confirmed mapping:** `臥櫃` means the **second-floor freezer (tủ đông tầng 2)** in Fuxing. Resolve to EXISTING `inventory_locations.code='fuxing-lengdongerlou'` (previous read-only audit: DB visible label `大冷凍`); do NOT confuse it with separate `fuxing-large-freezer`, which also shows `大冷凍`. This is a verified operational alias, **not a database location rename or additional location**.
- `海鮮台` in the SOP corresponds to existing Fuxing seafood work location `fuxing-work-seafood` / DB label `海鮮區`.
- **Operator-confirmed units:** `1 盒 ≠ 1 包`. They are distinct; the operator has **not supplied any conversion ratio**. Never normalize, copy or recast a `盒` stock target/minimum into `包`, or vice versa. `豬肉蛋餃` and `牛肉蛋餃` currently use DB unit `包` whereas SOP uses `盒`; block those SOP quantity/minimum settings until the exact product-specific unit/packaging policy is confirmed.
- `三記魚餃` is stored in `盒` and the supplied SOP gives **臥櫃 10, 海鮮台 10** (interpreted only as the operator-provided location targets, not yet confirmed as reorder triggers). Previous read-only audit found existing minimums **20 盒** at `fuxing-lengdongerlou` and **1 盒** at `fuxing-work-seafood`. **No minimum/quantity write has occurred in this step**; an authorized `inventory.minimum.edit` operation with expected old minimum, fresh Inventory reread, audit and Desktop/Mobile verification is required before calling those settings live.
- `排骨酥` existing location minimum 3 斤 remains unchanged. Supplier mapping, closure days and any `盒`↔`包` equivalence remain NOT VERIFIED. No new supplier/order/inventory row, quantity change, or product-unit change is authorized by this confirmation.
- **NEXT:** use existing site-scoped API for audited location-minimum edits only after clarifying whether SOP location targets mean warning thresholds or desired replenish-to values; obtain product-specific 盒/包 conversion or distinct SKU policy for egg dumplings, and verify supplier associations. `ACTIVE_PR: none` after this documentation-only close. Sections below describing 臥櫃 as unknown are historical and superseded by this confirmation.

## BLOCKED — Fuxing supplier/minimum mapping audit (2026-10-11; READ-ONLY)

- **ACTIVE_PR: none** for runtime changes. A production read-only audit of the next Fuxing supplier SOP records succeeded in one-time Actions run `38068035044` (`ops/audit-fuxing-remaining-sop-20261011`), against PostgreSQL schema `034`. No Inventory, Procurement, supplier or site rows were written.
- Actual Fuxing items found: `三記魚餃` (`fuxing:freezer-sanji-fish-dumpling`, `盒`); `豬肉蛋餃` (`fuxing:freezer-pork-egg-dumpling`, `包`); `牛肉蛋餃` (`fuxing:freezer-beef-egg-dumpling`, `包`); `排骨酥` (`fuxing:freezer-crispy-ribs`, `斤`). `鴨肉丸` 1/3 rule remains configured.
- Stock/minimum at audit: `三記魚餃` 廚房冰箱 **20/1 盒**, `fuxing-lengdongerlou` 大冷凍 **0/20 盒**, 海鮮區 **0/1 盒**; `豬肉蛋餃` `fuxing-lengdongerlou` 大冷凍 **1/1 包**, 海鮮區 **0/0 包**; `牛肉蛋餃` same 大冷凍 **10/10 包**, 海鮮區 **0/0 包**; `排骨酥` `fuxing-large-freezer` 大冷凍 **3/3 斤**, 麵區 **0/0 斤**; `鴨肉丸` work 海鮮區 **0/0 包**, 1/3 Procurement alert enabled (full reference 1 包 = 30 viên).
- **Identity conflicts:** two separately coded storage locations `fuxing-large-freezer` and `fuxing-lengdongerlou` both display `大冷凍`; the SOP label `臥櫃` cannot be assigned to either without operator validation. Pork/beef egg dumplings use DB unit `包` while SOP says `盒`; no conversion is verified.
- **Supplier mapping:** read-only query returned no active `procurement_suppliers` records for Fuxing. Do not seed suppliers or assign `南門`, `津鼎`, `寶綠`, `漁鴻`, `聯興`, `濱江` by a guessed association. Do not assume Thursday is a weekly closed day.
- **NEXT gated action:** confirm actual `臥櫃` storage location ID, egg-dumpling `盒`↔`包` unit conversion, and supplier/product relationships with the operator; then adjust only verified location minimum / procurement rules through audited DB-backed operations and re-test Desktop/Mobile/Super Admin. Existing `排骨酥` minimum 3 斤 already matches the SOP and should not be rewritten.
- The previous STABLE section below remains authoritative for verified production code release `13c1ceb`; the new audit is not a new production deployment.

## STABLE — Procurement V2 production closure + Fuxing 鴨肉丸 1/3 reorder policy (verified 2026-10-10; handoff updated 2026-10-11)

- **ACTIVE_PR: none** for this completed Procurement workstream. Canonical main SHA and verified production release: `13c1cebff0254fae5dda2295ff16b4bd8679b5f8` (`13c1ceb`); production PostgreSQL schema `034`. Do not infer an active PR from unrelated old open pull requests.
- Procurement V2 supplier calendar, responsive Desktop/Mobile, bilingual component/catalog standardization, tab-state repair and optional per-location fractional alert are merged through PRs #230–#233. PR #233 merged at `13c1ceb`.
- Evidence on that exact SHA: main Staging #90 PASS (run `38032815646`); production Deploy #1402 PASS (run `38032869837`) including preflight, browser/DB regressions, exact-SHA deployment and production UI smoke; Inventory Site Production Audit #718 PASS (`38033494586`). Deployment health reported `app=ok, database=ok, schema=034, release=13c1ceb`.
- **Fuxing operational configuration was applied after release** by one-time guarded workflow `38039572403` (PASS, 2026-10-10), preceded by read-only identity audit `38038924307` (PASS) and production backup `/opt/kitchen-os/backups/kitchen_os_20261010T085546Z.dump`.
- Verified DB identity: Fuxing item `fuxing:freezer-duck-meatball` / `鴨肉丸` / unit `包`; configured work location `fuxing-work-seafood` / `海鮮區` (the actual DB label, not a fabricated `海鮮台` row). Alert is enabled with reference stock **1.000 包 = user-confirmed 30 viên**, numerator/denominator **1/3**, i.e. **10 viên** threshold. This is a reminder only, never automatic supplier ordering. Location stock was **0.000 包 at verification** (freezer 1.000 包 in earlier read-only audit); the workflow explicitly preserved Inventory stock quantities.
- No supplier was fabricated or associated with the item; other Fuxing supplier SOPs (`聯興`, `濱江`, `津鼎`, `寶綠`, `腐皮`, `漁鴻`, `南門`, `三記魚餃`, `豬肉蛋餃`, `牛肉蛋餃`, `排骨酥`) still require identity/unit/location/ordering-condition verification before any operational database write. Thursday supplier closures are conditional, not an unconditional recurring closure.
- **NEXT separate workstreams:** Fuxing supplier/item/minimum mapping based on verified records; Handoff periodic polling / authorized force refresh (see `docs/HANDOFF_REALTIME_CHECKLIST.md`); VPS disk review. Do not mix unverified Procurement mutations into a documentation or UI-only change.
- **Evidence distinction:** Production release/CI and Fuxing configuration are verified by GitHub Actions output; this is a historical verified snapshot, not an assertion that the current browser session itself queried live production. Older IN PROGRESS paragraphs below are preserved as chronology and are superseded by this closure header.

## IN PROGRESS — Procurement location-based fractional reorder SOP (2026-10-10)

- User confirmed `鴨肉丸 海鮮台 餘 1/3 叫貨` means **trigger a reorder warning once 1/3 of the full/reference quantity remains at the Seafood Work Area**. Do not interpret "3/1" as three pieces or auto-place any supplier order.
- Branch `feat/procurement-ratio-stock-alert`. Extend existing `procurement_product_rules` via additive migration 034 with opt-in `reorder_alert_enabled`, FK `reorder_location_id`, configurable full/reference quantity, and integer numerator/denominator (defaults 1/3). No new Inventory tables, stock data, suppliers or fictional inventory entries.
- Per-item popup now requires authorized editor to select one of that exact item's configured Inventory location-stock rows, verify full/restock quantity, and enable the threshold. Formula: `remaining * denominator <= reference * numerator`. Missing/stale/archived location stock is NOT treated as zero.
- Read-only stock remains authoritative from `GET /api/inventory/:site` and existing live refresh. Backend validates product and location belong to authenticated site, with optimistic revisions and audit; no auto-order, receiving transaction or supplier message occurs.
- Remaining manual mapping: user must confirm branch/site and identify the actual `鴨肉丸` item and `海鮮台` location within that branch; the system must not match by guessed display names or hardcode supplier records. The operator must enter the confirmed `補滿基準量` (full stock before use); no arbitrary baseline assumed.
- Other supplier SOP statements (聯興, 濱江, 津鼎, 寶綠, 腐皮, 漁鴻, 南門 and fish dumpling/egg dumpling/ribs minima) remain documented for mapping to existing procurement suppliers, inventory items and location minimums; do not write guessed default inventory quantities or treat Thursday as an unconditional closure.
- Must pass migrations, API round-trip, exact-name Search regression, desktop/mobile browser, staging, merge/main CI, production smoke before DONE.

## IN PROGRESS — Procurement selected tab reset during site hydration (2026-10-10)

- Previous refactor PR #231 merged at `8fef917`; production workflow `37984156669` correctly blocked before deploy because Chromium sometimes lost the settings tab when the inventory site was reinitialized.
- Follow-up branch: `fix/procurement-preserve-tab-state`. Preserve `ui.tab` through site rehydration; reset only site-specific inventory snapshot, filters, drafts and selected items. No Database changes, no new supplier/product data, no RBAC edits.
- Strengthen browser regression: the selected Settings tab must be visibly active before creating a supplier; static contract prevents reintroducing `ui.tab="list"` on site switch.
- Require Staging exact-head PASS and all PR CI gates before new merge, then post-merge Production smoke. **Production has NOT been updated by PR #231 as of this log.**

## IN PROGRESS — Procurement V2 i18n, UI components and design-token standardization — 2026-10-10

- Continuation of PR #231 on branch `fix/procurement-mobile-layout-parity`; user approved Mobile layout and requested standardization. Do not merge/deploy before CI and browser certification.
- Added >120 keys under **existing** `src/i18n.js` `TEXT.zh.procurementUi` and `TEXT.vi.procurementUi` for labels, help copy, statuses, form controls and notification text.
- Added `src/procurement-v2-components.js`: pure reusable Tabs, Stat, Panel, ProductCard, SupplierCard, FilterBar and SettingsModal HTML components; they receive site/supplier/inventory data from the existing DB-backed `src/procurement-v2.js` caller and own no master data/state.
- Reused existing language preference from `ctx.language`; zh renders Traditional Chinese, vi renders paired Traditional Chinese / Vietnamese labels as established in Procurement V2. Translation catalog parity and HTML escaping are tested.
- Centralized core colors, borders, typography, radius and spacing as `--pv2-*` design tokens in `src/procurement-v2.css`, used by the same stylesheet for Desktop/Mobile.
- No SQL migrations, backend authorization changes, business calculation changes, stock duplication or altered inventory literal-search semantics.
- Required gates: `tests/procurement-v2-contract-regression.mjs`, `tests/procurement-v2-translation-components-regression.mjs`, real Chromium tests including mobile widths 320/359/390/430/760/768/991/1024 and CSS/clipping, Staging, Super Admin, DB and production smoke. User confirmation must not substitute failing CI.

## IN PROGRESS — Procurement V2 Mobile typography/layout parity — 2026-10-10

- Branch: `fix/procurement-mobile-layout-parity` off merge commit `1405b95`; scoped to `src/procurement-v2.css` and browser layout regression. No DB migration, backend, Stock API, search rule or business logic changes.
- On phones/tablets ≤760px five bilingual tabs retain equal heights in one horizontal scroll row, rather than wrapping 3+2 with broken labels.
- Mobile stock/order cards render product and bilingual name on their own header, supplier on one full-width row, then demand/stock and suggestion/quantity as two aligned columns with adequate touch dimensions.
- Summary/stat cards, filters, date picker, supplier cards, per-product settings rows, calendar and product modal have responsive min-width/overflow handling. Desktop table remains readable.
- Browser E2E `tests/procurement-v2-browser-regression.mjs` now validates widths 320,359,375,390,430,600,760,768,1024,1440 for horizontal document overflow, clipped card controls and inconsistent tab/stat heights.
- Must pass staging, browser/DB gates and production checks before publishing. This is CSS-only; no data re-seed and no hand-coded mobile product set.

## IN PROGRESS — Procurement supplier calendar, product popup, live Inventory sync — 2026-10-10

- Scope PR #230, branch `feat/procurement-responsive-db-v2`. This follow-up does NOT create a new database/schema or update production.
- Supplier special closures: replaced freeform date textarea with clickable month-grid calendar (two clicks select an inclusive range), native date pickers for start/end and a range-add button, individual date chips/removal, up to 120 configured exception days. Reuses existing `procurement_suppliers.closed_dates` in migration 033; no new tables.
- Product-rule settings open in a fixed responsive modal with keyboard Escape/Tab handling; no scrolling to a bottom-of-page editor.
- Product modal shows *read-only authoritative Inventory API data*: bilingual names, categories, unit, configured location-by-location stock, sum of physical stock, existing location minimum and receive-default location; `safetyStock` in procurement remains logically separate from Inventory's minimum.
- `#procurement` uses existing `vpsInventory(site,{force:true})` plus configured suppliers API. Direct SQL writes to Inventory/Super Admin are picked up through active-tab forced reads every ~30s (plus focus/visibility and existing cloud events), with no new stock tables. Background refresh avoids repainting unsaved supplier/product editors; on refresh failure existing data stays visible with an error.
- Contract test `tests/procurement-v2-contract-regression.mjs` validates leap year, range reversal, overlap/dedup, invalid dates, maximum 120, UI modal and same Stock API source. Real-browser `tests/procurement-v2-browser-regression.mjs` asserts Desktop/Mobile date selection, persisted supplier changes, product modal, and focus reload.
- Important: Direct SQL outside the app does not emit the existing SSE broadcaster, so forced GET is polling-based, **not instantaneous realtime**. No invented provider/stock items. Do not merge or promote until fresh staging and regression checks are green.

## IN PROGRESS — Procurement v2 responsive + PostgreSQL supplier policy, 2026-10-10

- Branch: `feat/procurement-responsive-db-v2`. Production remains untouched pending test gates; `ACTIVE_PR` not yet set.
- Replaces only `#procurement` renderer; includes one shared Desktop/Mobile bilingual UI with list, supplier, category, history and settings tabs.
- New migration `033_procurement_supplier_calendar.sql`: site supplier calendars, product usage rules linked to `inventory_items.id`, service-day overrides, order headers/lines and idempotency.
- Procurement API uses authenticated site/role checks and a PostgreSQL transaction for writes; product stock/catalog read existing inventory DB snapshot.
- No supplier/item rows seeded. Actual supplier names and product associations must be configured from verified operation records.
- Search reuses `prepareIngredientNameSearchCorpus` / `prepareIngredientNameSearchNeedle`, strict literal bilingual product names, no phonetic aliases.
- Planned/remaining verification: exact-head JS syntax; SQL staging migration; API auth/round-trip and order semantics; mobile geometry 359/390/430/760px; all branch parity; production smoke only after successful staging.
- Do not mark DONE/merge until all relevant gates pass. Existing procurement local legacy business-state may remain for historical/backcompat, not authoritative new supplier rules.

## STABLE — PR #229 dedicated Excel export, 2026-10-09

- `ACTIVE_PR: none`.
- Production application release: `9b4ee6c51886693f3690022b17775e621a4c5a11`; PostgreSQL schema remains `032`.
- Follow-up to PR #228, scoped only to `#reports`.
- Inventory Report export actions are now distinct: **TXT / PDF / CSV / Excel / Copy**.
- CSV remains UTF-8 CSV.
- Excel now downloads a dedicated Spreadsheet XML `.xls` file with `application/vnd.ms-excel`, bilingual headers, numeric quantity/minimum cells, and only the currently selected report products.
- Mobile export controls remain the same responsive component: four file actions on normal mobile widths, 2-column fallback at <=420px, plus full-width Copy action.
- Existing Inventory UI/business logic and literal product-name search semantics were not changed by this PR.
- Exact PR head `bb56b79c1112f9e0a2b80db991983d5d89248e6d`: Staging #23 PASS, Super Admin Browser #504 PASS, Workforce Approval #652 PASS, Deploy/full regression #1335 PASS.
- PR #229 squash-merged as `9b4ee6c51886693f3690022b17775e621a4c5a11`.
- Main Pages #1060 PASS, Staging #24 PASS, Production #1336 PASS: preflight, full regression, exact-SHA deploy and production UI smoke all succeeded.
- No schema migration, RBAC change, inventory quantity/minimum mutation or transaction semantic change.

## STABLE — PR #228 Inventory Reports + literal product-name search, 2026-10-09

- `ACTIVE_PR: none`.
- Production application release: `99d2d391fc0123140ee3d221d302ad8dc88df6f2`; PostgreSQL schema remains `032`.
- PR #228 redesigned **Reports > Inventory report** at `#reports` only. Existing Inventory layout/business logic was not redesigned.
- Inventory Report is DB-backed: visible sites come from `/api/inventory/sites`, stock/products/categories/units from `/api/inventory/:site`, and Work Area/location master data from `/api/master-data/:site`. Super Admin and Website therefore read the same PostgreSQL authority.
- Report UI is one responsive Desktop/Mobile component with site / Work Area / category / product filters, selectable products, status summaries, report preview, TXT export, PDF via browser print/PDF, UTF-8 CSV for Excel, and Copy text.
- Search contract is now **field-aware literal substring by actual product name only** across branch Inventory Overview / Receive / Pick / Transfer / Ship / Manage, Central Inventory, and Inventory Reports:
  - Vietnamese query searches actual `name_vi`; Chinese query searches actual `name_zh_tw`.
  - Vietnamese diacritics are preserved: `cá` matches names containing `cá`; `ca` does not infer `cá`; `bò` does not normalize to `bo`.
  - Chinese literal substring works directly: e.g. `魚` matches Chinese names containing `魚`.
  - Pinyin, Zhuyin/注音, initials/abbreviations, semantic aliases, location, category, Work Area, unit and internal-key guessing are forbidden for Inventory/Inventory Reports search.
  - Examples that must return no inferred match: `niu rou`, `nr`, `n r`, `ㄋㄧㄡ`, `kg`, `大冷凍` unless those exact characters are literally part of a product name.
- Generic phonetic search utilities remain available to unrelated modules; only Inventory-family search paths use the literal ingredient-name helpers.
- Exact tested PR head: `5d6f9f7a10b39edc3a54114d255fecce546494cc`.
- PR validation: Staging #21 PASS; Super Admin Browser #503 PASS; Workforce Approval #651 PASS; Schedule #170 PASS; Attendance #62 PASS; Payroll #51 PASS. Deploy/full regression #1333 attempt 1 hit a transient Firefox language-toggle timeout after route geometry passed; unchanged exact head attempt 2 PASS, including preflight and full-device browser regression.
- PR #228 squash-merged as `99d2d391fc0123140ee3d221d302ad8dc88df6f2`.
- Main GitHub Pages #1057 PASS; Staging #22 PASS; Production #1334 PASS: preflight, regression, exact-SHA deploy and production UI smoke all succeeded.
- No schema migration, inventory quantity/minimum rewrite, RBAC semantic change or transaction behavior change.
- This section **supersedes the older PR #217/#218 Pinyin/注音/metadata Inventory-search behavior** documented below. Do not reintroduce those semantics into Inventory search.

## STABLE — Multi-site Inventory Master Data RBAC repair, 2026-10-08

- `ACTIVE_PR: none`.
- Root cause of failed Fuxing/Yongji/Central switching: `/api/inventory/sites` and `/api/inventory/:site` honored PostgreSQL `inventory.view` rules, but `GET /api/master-data/:site` still enforced legacy single-site `user.location`.
- Result: a user could see a site in the switcher and read its Inventory snapshot, while the companion Master Data request returned `403 SITE_NOT_ALLOWED`, causing the full site hydration to fail.
- PR #226 aligns Master Data READ authorization with the same explicit `inventory.view` site scope while preserving all existing location/work-area WRITE restrictions.
- Regression proves: no scope -> 403; explicit cross-site `inventory.view` -> Master Data GET 200; cross-site Master Data write remains 403.
- PR #226 merged as `a6ec4b569adb90b01620c319e0325c039b8b061c`.
- Main Staging #14 PASS; Production #1326 PASS: preflight, full regression, exact-SHA deploy and production UI smoke.
- No schema migration or inventory quantity mutation.

## STABLE — Staging-gated production promotion, 2026-10-08

- `ACTIVE_PR: none`.
- Current production release: `2e2a42d163c741aa122bf4fbac5fe3e449001f12`; PostgreSQL schema `032`.
- PR #221 bootstrapped a physically isolated staging runtime on the VPS: separate web/API containers plus PostgreSQL volume `kitchen_os_staging_postgres_data`; staging is served at `https://staging.82.47.180.185.nip.io`.
- Every staging deployment takes a read-only `pg_dump` from production, restores it into staging, requires an exact schema fingerprint match before candidate migrations, clears staging sessions, applies migrations only to staging, then runs data-integrity and edge health verification.
- Drift/failure classifications are explicit: `STAGING_CLONE_DRIFT`, `PRODUCTION_SCHEMA_CHANGED_DURING_STAGING`, `STAGING_DB_NOT_STABLE`, `STAGING_DATA_INTEGRITY_FAILED`.
- First live staging attempt correctly exposed a PostgreSQL first-start temporary-server race; the deployer was hardened to require two stable SQL/health probes before restore.
- PR #222 enabled automated staging for PR and main candidates. A single physical staging stack is serialized; candidates are not allowed to cancel the currently running main staging candidate.
- PR #223 made staging a hard production gate. `Deploy Kitchen OS to VPS` no longer has a direct `push: main` production path; it is triggered by successful `workflow_run` completion of `Deploy Kitchen OS Staging` on main.
- SHA authority is exact: PR validation uses `github.event.pull_request.head.sha`; production promotion uses `github.event.workflow_run.head_sha`; server-side deploy still verifies the target is an ancestor of `origin/main` and resets to that exact commit.
- End-to-end proof on main: Staging #9 PASS for `2e2a42d...` → Production #1321 started only afterward with `event=workflow_run` and the same SHA → preflight PASS → full regression PASS → exact-SHA deploy PASS → production UI smoke PASS.