# Kitchen OS — Conversation Archive

Date: 2026-09-05 (Asia/Taipei)
Repository: `vial1307/restaurant-management-system-demo`
Project: Restaurant Management / Kitchen OS

> This file is a sanitized technical archive of the conversation and work session. Passwords, SSH private keys, tokens, credentials, and other secrets are intentionally excluded.

## 1. User operating instruction

The user asked the assistant to continue fixing the system autonomously for all changes that are safe, testable, reversible, and do not require business-policy approval.

Working rule agreed during the conversation:

- Safe/testable fixes can be completed autonomously.
- Every completed phase should be committed to GitHub to avoid loss.
- Do not call a change DONE until automated regression, deployment, production health, and production smoke checks pass.
- Deep or potentially destructive changes must be recorded as `PENDING APPROVAL` rather than performed automatically.
- Production must remain on the last fully validated commit while new fixes are tested.
- PostgreSQL on the VPS is the authoritative shared data source; localStorage may only be UI/cache/offline support and must never be treated as a successful persistent write when the VPS/database has not confirmed it.

Deep changes that remain approval-gated include:

- major whole-app rendering architecture refactor,
- business-state conflict/optimistic-concurrency semantics changes,
- destructive production database cleanup or migration,
- VPS host architecture/package changes,
- heavy monitoring stack installation,
- high-load stress testing directly against production,
- physical-device lab certification on real iPhone/Android hardware.

## 2. Active repository and architecture

Active repository:

- `vial1307/restaurant-management-system-demo`

Historical repository:

- `vial1307/restaurant-management-system`

Current runtime architecture:

- Frontend: browser app
- VPS edge/static: Caddy
- API: Node.js in Docker
- Database: PostgreSQL 16
- Deployment: GitHub Actions -> exact tested SHA -> VPS
- Database backup before deployment
- Database migrations + integrity verification before frontend activation
- Production smoke test after deployment

Supabase is no longer the runtime source of truth.

## 3. Major product requirements confirmed in the conversation

### Sites

- Central Kitchen / 央廚
- Fuxing / 復興
- Yongji / 永吉

### Inventory semantics

- `領貨`: move items from storage into work/use inventory.
- `使用`: consume the actual used quantity.
- `歸位`: return leftovers from work/use to storage.
- `出貨`: cross-site shipment from source storage to the exact destination branch/storage location.
- Current phase does not require manager confirmation for transfers; actor/user must be recorded.

### Branch management

Fuxing and Yongji managers must be able to manage destination storage mappings and catalog/storage controls when their permissions allow it.

Central/factory staff should be able to select a product and have the destination receive location follow the branch configuration.

### Frontend/data contract

Desktop and mobile must have functional parity.

All mutations that are meant to persist must:

1. show pending/success/error state,
2. wait for real VPS/database result,
3. roll back or report failure when persistence fails,
4. remain correct after refresh/re-login/second-device verification.

## 4. Full Device testing work completed

The browser regression system was expanded beyond the original Chromium-only functional checks.

Current Full Device coverage includes:

- Chromium
- Firefox
- WebKit

Representative profiles include desktop, laptop, small mobile, iPhone-like mobile, Android-like mobile, tablet, and landscape orientation.

Important responsive rules added during this session:

- prevent whole-page horizontal overflow,
- normalize legacy form-control sizes,
- minimum desktop control dimensions,
- larger mobile touch targets,
- mobile inputs use readable font sizing,
- long Traditional Chinese/Vietnamese text wraps instead of breaking layout,
- modal content stays within viewport,
- modal body scrolls vertically,
- sticky footer remains reachable,
- orientation change must not break layout/state,
- screenshots and geometry diagnostics are produced when Full Device fails.

### Full Device issues found and fixed during the conversation

The new tester caught multiple real issues that older Chromium functional tests did not catch, including:

- account action controls below touch/geometry contract,
- Inventory inputs/selects using 10-12px legacy sizing and 21-27px heights,
- Preparation selects using 10px text,
- small-mobile Schedule controls with nowrap overflow,
- SOP mobile responsive issues,
- login-shell/bootstrap behavior on WebKit,
- a modal sticky footer expanding beyond the viewport due to negative horizontal margin,
- a `.modal-submit-bar` reaching roughly 1484px width on a 1440px viewport,
- small-mobile minimum-quantity input sizing issues,
- WebKit CI cookie behavior that prevented the Safari engine test from progressing.

The modal overflow fix was based on element-level diagnostic output rather than hiding the problem with a global `overflow-x:hidden` workaround.

## 5. CI/CD reliability fixes completed

### Exact tested SHA deployment

The deploy pipeline was changed so that the VPS deploys the exact `GITHUB_SHA` that passed CI.

This prevents the dangerous condition where:

- commit A is tested,
- commit B/C reaches `main`,
- the older workflow later runs `git pull main` and deploys code it never tested.

The VPS deploy script now requires the exact target and validates that target belongs to main history.

### Deploy script self-reload

The deploy script detects when the selected tested commit contains a newer deploy script and re-executes the selected script so deployment logic is not one release behind.

### Host Node dependency removed

A deployment previously failed with:

`node: command not found`

Release stamping is now executed inside a pinned Node Docker container (`node:22-alpine`) rather than requiring Node.js on the VPS host.

### Dependency reproducibility

Added committed lockfiles for:

- backend,
- browser tests.

Production Docker and CI now use `npm ci` rather than resolving semver ranges with `npm install` on every build.

### Repository hygiene

Added/guarded:

- `.gitignore`
- backend `.dockerignore`

to prevent accidental commits/build-context inclusion of:

- `node_modules`,
- `.env`,
- log output,
- screenshots/test artifacts,
- other local runtime files.

### GitHub Actions modernization

Actions were moved to the current generation used by the repository, including:

- `actions/checkout@v7`
- `actions/setup-node@v7`
- `actions/upload-artifact@v7`

Regression guards prevent reverting to the older generation.

## 6. Authentication/browser compatibility fixes completed

A series of frontend ESM/bootstrap problems were found while enabling WebKit testing.

### API adapter mismatches

Several frontend imports did not match exports/endpoints from `vps-api.js` and backend routes, causing module loading to fail before the app shell rendered.

Examples fixed during the session included missing/misaligned adapter functions such as direct transfer and catalog-related calls.

### Auth bootstrap race

A WebKit-specific sequence showed:

- login API returned HTTP 200,
- session state was briefly created,
- an older `/auth/me` result/lifecycle path could remove/reconcile the session incorrectly,
- the application could return to the login shell or fail to render the authenticated shell.

The auth flow was hardened so stale authentication checks cannot invalidate a newly authenticated session incorrectly.

A small reconcile layer remains to make WebKit/Safari DOM reconciliation deterministic without polling.

### WebKit CI cookie behavior

Chromium and Firefox retained the test session naturally, while Playwright WebKit/Linux dropped the session cookie in the CI proxy environment.

Production cookie security was not weakened to make the test pass.

Instead, the Full Device test:

1. attempts a real WebKit login first,
2. only if the known CI-only pattern occurs (login succeeds but WebKit drops the cookie),
3. seeds the valid test session into the BrowserContext so Safari-engine UI testing can continue.

Production authentication/cookie semantics remain unchanged.

## 7. Inventory persistence fixes completed

### Fake success removed

A critical problem was found where `cloudSetReceiveDefault()` could update localStorage first and report fallback success even though the VPS/PostgreSQL had not confirmed the write.

This was changed to server-first semantics:

- offline -> fail,
- migration/backend unavailable -> fail,
- no permission -> fail,
- API error -> fail,
- local mirror updates only after the VPS confirms success.

### Inventory mutation fallback removed

A further audit found multiple inventory mutation paths that could leave optimistic/local state looking successful while the shared database had not accepted the write.

Fourteen mutation fallback paths were hardened so database unavailability is explicit and optimistic UI can roll back.

### Receive-default caller validation

Both create-product and edit-product flows now verify the receive-default persistence result.

If product/catalog persistence succeeds but the receive-location policy fails, the UI reports the partial failure instead of silently showing a complete save.

### Inventory history endpoint mismatch

Frontend inventory history was calling an obsolete `/history` route while the backend uses `/transactions`.

The frontend adapter was corrected to the backend transactions route.

## 8. Performance and request-deduplication work completed

### Receive-default request burst

Receive-default reads were observed firing repeatedly.

Added:

- 5-second burst cache,
- stable site/catalog-key cache key,
- in-flight request reuse,
- invalidation after relevant writes/session changes.

### Auth/admin account requests

Concurrent startup/focus layers could request the same auth profile and admin-user list simultaneously.

Added in-flight deduplication for:

- `/api/auth/me`
- admin user-list refresh.

The result is not permanently cached after the in-flight request finishes, so permission/account changes can still be observed promptly.

### Existing performance guards

Regression protects against:

- translation MutationObserver observing its own changes,
- unnecessary whole-app render on unchanged inventory polling,
- inventory search triggering whole-app render,
- unchanged business-state revision triggering merge/render,
- deploy logic regressions,
- dependency/CI regressions.

## 9. Multi-user/database regression coverage

The API regression runs against an isolated PostgreSQL regression database.

Tests include:

- role/site permission filtering,
- business-state reads/writes,
- unauthorized settings mutation rejection,
- inventory site access,
- catalog persistence,
- quantity/minimum writes,
- receiving-default routing,
- stock in/out,
- insufficient-stock protection,
- internal transfer,
- cross-site shipment restrictions,
- actor/audit attribution.

Multi-user concurrency regression was added to verify simultaneous inventory updates do not lose increments and that business modules can be updated concurrently without unrelated data loss.

## 10. Business-state synchronization race fixes completed

Several data-loss risks were found and covered by runtime tests.

### Save failure followed by reload

Previously, focus/online handling could attempt save and then load even if save failed.

This could pull older server state over unsaved local data.

Fixed behavior:

- failed save -> do not reload server state.

### New edit while save is in flight

If the user edits again while a save is awaiting the network, the later local edit must win.

Fixed behavior:

- save completion compares the current local business-state snapshot to the snapshot actually sent,
- newer local edits prevent stale reload behavior.

### New edit while server refresh is in flight

If a local edit appears after a refresh starts but before the server result returns, the older server result must not merge over the new edit.

Fixed behavior:

- local snapshot is captured before the read,
- stale merge is deferred when the local snapshot changed.

Runtime regression prints:

`BUSINESS_STATE_SYNC_RUNTIME_OK`

and is executed in preflight.

## 11. Device/account synchronization retry fix completed

A bug was found in `device-sync.js`:

- the five-minute admin-account refresh throttle timestamp was written before `vpsListUsers()` succeeded,
- therefore one transient network error could prevent an account-list retry for up to five minutes even after connectivity returned.

Fix:

- the throttle timestamp is updated only after a successful VPS response.

Runtime regression covers:

`failed request -> online/retry -> successful account refresh`

and prints:

`DEVICE_SYNC_RUNTIME_OK`.

This fix was deployed through full CI in run #135.

## 12. Production state at the time of this archive

Production validated release at archive time:

`ea1c83554d330a07d08bf056bf85e773dfcb3fa0`

GitHub Actions run:

`#135`

Run #135 passed:

- preflight,
- static regression,
- performance regression,
- business-state runtime regression,
- device-sync runtime regression,
- backend syntax,
- Caddy validation,
- API/PostgreSQL regression,
- multi-user concurrency regression,
- desktop/mobile Chromium regression,
- Full Device Chromium/Firefox/WebKit regression,
- screenshot artifact upload,
- exact-SHA VPS deployment,
- pre-deploy DB backup,
- migrations,
- production DB integrity audit,
- production health/release verification,
- production UI smoke.

Production database integrity at that point:

- active users: 4
- active inventory items: 188
- stock rows: 234
- inventory transactions: 34
- Central active items: 42
- Central stock rows: 42
- Central active locations: 5
- Fuxing active items: 74
- Fuxing stock rows: 98
- Fuxing active locations: 8
- Yongji active items: 72
- Yongji stock rows: 94
- Yongji active locations: 8
- schema: 005
- integrity warnings: 0
- integrity errors: 0

Production health reported app/database OK and the expected release.

## 13. Current WIP at the moment this archive was requested

A new race condition was confirmed but not yet merged into production.

Branch:

`fix-site-switch-save-20260905`

Latest WIP commit created before this archive request:

`1d657864bb326cb13918fe7f1ca80b25b3436323`

Problem being solved:

1. user edits a non-inventory business module,
2. business-state save is still waiting in the 450ms debounce window,
3. admin immediately switches active site/warehouse,
4. the site-change load path clears the old save timer,
5. the pending edit can be lost before it is persisted to the original site.

Proposed safe behavior under development:

- intercept site-switch action when a business-state save is pending,
- persist the current site's pending business data first,
- only replay/allow the warehouse switch after save succeeds,
- if save fails, remain on the current site and preserve the local edit,
- if a newer local edit appears while the save is in flight, do not switch until that state is safely handled.

This WIP must still receive:

- branch diff review,
- runtime regression for `edit -> immediate site switch`,
- failure-path test,
- success-path test,
- preflight,
- API/PostgreSQL regression,
- multi-user concurrency regression,
- Chromium/Firefox/WebKit Full Device,
- exact-SHA deploy,
- production database integrity check,
- production smoke.

Until that completes, production should remain on `ea1c835`.

## 14. Known PENDING APPROVAL items

These were intentionally not auto-implemented:

### Persistent application shell refactor

`src/app.js` still contains a large full-root rendering pattern. This remains the largest architectural source of potential UI jank.

Recommended future design:

- mount app shell once,
- route/page/component-level updates only,
- preserve focus/scroll/modal state,
- avoid rebuilding sidebar/topbar/mobile nav on unrelated data changes.

This is a deep refactor and should not be mixed with business-feature work.

### Business-state optimistic concurrency/conflict resolution

Business modules are shared through PostgreSQL, but same-module concurrent edits still need a deliberate product decision for conflict behavior.

Possible future options:

- base revision / If-Match style write,
- conflict response,
- merge UI,
- last-write-wins retained explicitly.

This changes user-visible semantics and remains approval-gated.

### Heavy monitoring stack

No Prometheus/Grafana/cAdvisor stack was installed automatically.

A lightweight future telemetry layer can expose:

- API uptime,
- DB pool total/idle/waiting,
- API latency,
- error rate,
- disk/backup health.

Host-level monitoring installation remains approval-gated.

### Production load testing

No aggressive concurrency/load test should run against production without approval.

Recommended future staging progression:

- 10 concurrent users,
- 25,
- 50,
- 100,

with p50/p95/p99 latency, error rate, DB pool pressure, CPU/RAM/disk telemetry.

### Real hardware certification

Playwright WebKit/Chromium/Firefox provides strong engine-level coverage but is not equivalent to testing on actual:

- iPhone Safari hardware,
- Android Chrome hardware,
- tablets under real keyboard/network/background lifecycle conditions.

## 15. Resume instructions for the next session

If work resumes later, do not restart from an older project description.

Start by checking:

1. current `main` SHA,
2. production `/RELEASE`,
3. latest GitHub Actions run,
4. branch `fix-site-switch-save-20260905`,
5. diff from production/main to that branch,
6. WIP site-switch runtime regression status.

If `main` is still `ea1c835`, continue the site-switch save race fix from branch `fix-site-switch-save-20260905`.

Do not merge the branch until runtime regression and the full deployment pipeline are green.

## 16. Security note

This archive deliberately excludes all passwords, SSH credentials, private keys, tokens, connection secrets, and other sensitive values that appeared or may have appeared during interactive setup.

Secrets belong only in secured environment/secret-management systems and must never be committed to the repository.
