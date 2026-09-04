# Kitchen OS — Development Rules

These rules are mandatory for every future feature, fix, refactor, and UI update.

Detailed frontend/data invariants: `docs/FRONTEND_DATA_RULES.md`.

## 1. One account system / SSO-ready architecture

- VPS API + PostgreSQL is the only identity and permission source.
- Authentication, session, role, workplace, permissions, and user preferences must not depend on one browser's localStorage.
- Keep provider-specific behavior behind the VPS API modules; UI components must not access PostgreSQL directly.
- Core runtime business processing must remain under Kitchen OS VPS control.
- Do not introduce Supabase, Firebase, or another hosted backend as a parallel authoritative runtime layer without an explicit architecture change.
- GitHub is the approved external service for source-code storage, version history, CI/CD workflow and deployment source.

## 2. Cross-device consistency

Every change must be checked for:
- desktop PC
- laptop
- mobile phone
- common mobile widths and landscape mode

The same account/site must receive the same:
- role
- permissions
- workplace
- visible modules
- language preference
- inventory/business data
- history/audit data
- action semantics
- success/error behavior

Browser localStorage may be used only as cache/offline fallback/UI state, never as the authoritative shared database for multi-device business data.

## 3. Data synchronization and VPS persistence

- All shared business data must use PostgreSQL on the VPS as the source of truth.
- All data-changing runtime actions must go through the VPS API.
- Use focus/visibility refresh and periodic polling until VPS SSE/WebSocket synchronization is introduced.
- Writes must be idempotent or auditable when possible.
- Inventory mutations must create transaction/audit records.
- Direct stocktake correction is restricted to authorized roles/permissions and must record before/after values.
- Never silently overwrite VPS quantities/business state from a stale device.
- A local cache write is not a successful save.
- Every data-changing action must show success only after VPS/API confirmation and must show a useful error when validation, permission, network, API or database persistence fails.

## 4. Language

Supported UI modes:
- Traditional Chinese (Taiwan)
- Vietnamese + Traditional Chinese

Requirements:
- Taiwanese restaurant/operations terminology should be used for Chinese labels.
- Search should support Chinese, Vietnamese, Vietnamese without accents, Pinyin, and Zhuyin where applicable.
- Language preference belongs to the signed-in account and must synchronize across devices where supported.
- New screens and controls must be added to the translation catalog; avoid hard-coded single-language labels.
- Bilingual/translated labels must be checked for wrapping, clipping and responsive overflow on mobile.

## 5. Bootstrap-standard responsive UI

All text, buttons, forms, cards, modals, tables, badges, alerts and navigation controls must follow Bootstrap-style responsive/component principles.

If Bootstrap is used as a library, self-host its assets with the application. Do not add a third-party Bootstrap CDN runtime dependency.

Every UI update must be reviewed at:
- <=359px
- 360–389px
- 390–429px
- 430–599px
- 600–760px
- desktop/tablet widths
- phone landscape

Priority:
- readable product names, labels, quantities and units
- long Vietnamese/Traditional Chinese text remains readable
- responsive font/button sizing appropriate to device width
- compact but legible vertical spacing
- tap targets large enough for mobile
- no hidden/vanishing checkbox, select, input, save button or primary action
- no horizontal clipping of critical actions
- prefer wrapping, stacking and flexible sizing over ellipsis/hiding for important business text
- equivalent desktop/mobile UI may rearrange but must preserve the same functional capability unless explicitly specified otherwise

## 6. Interactive-control contract

No button/action is complete only because it is visible or clickable.

For data-changing controls the required flow is:
1. click/tap;
2. visible pending/processing state where appropriate;
3. VPS API request;
4. server authentication, permission, input and business-rule validation;
5. PostgreSQL mutation;
6. success message/state only after confirmed success;
7. explicit failure feedback on rejected/failed operations;
8. UI reconciliation with the server result.

Prevent duplicate submission for critical mutations while a request is in flight.

Fake success after failed server/database persistence is prohibited.

## 7. Permissions

Permission checks must exist in both:
- UI visibility/interaction
- server/database authorization

Do not rely only on hidden buttons for security.

## 8. Cross-module synchronization

Modules representing the same real-world business facts must use synchronized canonical/derived data.

Mandatory dependency reviews include, where applicable:
- inventory -> procurement and shortage/factory-order calculations;
- safety minimums -> alerts and procurement;
- reservations -> preparation and staffing/load assessment;
- SOP revisions -> learning/training/qualification;
- schedules + employee skills -> staffing-capacity assessment;
- shared staff/configuration -> all dependent pages.

Do not create separate unsynchronized copies of the same business fact.

## 9. Branch functional parity

Equivalent functionality at 央廚, 復興店 and 永吉店 must use the same semantics, validation, interaction feedback, responsive behavior and translation behavior unless the canonical specification explicitly defines a branch-specific exception.

When fixing a shared branch feature:
- review all affected sites;
- do not patch only one branch if the rule is common;
- keep save behavior and database persistence equivalent;
- document any intentional branch-specific difference.

## 10. VPS architecture

All runtime modules must use the VPS API.

Keep these boundaries:
- UI
- auth/session
- API/data access
- realtime/sync
- database schema/migrations

Core path:

`Browser/UI -> Kitchen OS VPS API -> PostgreSQL`

Current stack:
- VPS session authentication
- PostgreSQL behind the Node.js API
- polling plus focus/visibility refresh
- optional future WebSocket/SSE without changing the UI permission model

Third-party services must not silently become authoritative for core authentication, permissions, inventory, business persistence or critical synchronization. Any future external service integration must document its purpose, data exposure, failure mode and removal/migration path.

## 11. Release checklist

Before publishing each version:
1. Check JavaScript syntax for edited modules.
2. Bump asset/service-worker version where required.
3. Confirm PC/laptop/mobile load the same release.
4. Check account permissions on at least two device classes.
5. Check language synchronization and long bilingual labels.
6. Check any changed business data is VPS/PostgreSQL-backed or explicitly local-only by design.
7. Check mobile layout at representative breakpoints.
8. Verify changed buttons/actions have pending/success/error behavior and database round-trip.
9. Check cross-module dependencies for shared facts.
10. Check branch parity for shared branch functionality.
11. Update SQL migration/setup docs when schema changes.
12. Commit all work to GitHub.

## 12. Post-update engineering review

After every update, fix, refactor, schema change, or deployment change, perform a full-system review rather than validating only the edited component.

Mandatory review areas:

### Architecture
- Verify module boundaries remain clean: UI, auth/session, permissions, data access, sync/realtime, database.
- Check for duplicated state sources and remove browser-only authoritative state.
- Confirm no new third-party backend has become a hidden runtime authority.

### Authentication and authorization
- Test login/logout/session restore.
- Verify role, workplace, active/disabled account state, and per-module permissions.
- Verify authorization exists server-side, not only in UI.
- Test at least Admin plus one restricted account.

### Data integrity
- Verify shared data has PostgreSQL/VPS as its single authoritative source.
- Check optimistic/local updates cannot overwrite newer server values.
- Check audit trails for sensitive operations such as inventory correction.
- Verify database migrations are idempotent where practical.
- Check transaction boundaries for stock mutations.
- Verify success states are emitted only after server persistence confirmation.

### Cross-device synchronization
- Verify the same account gets the same data and permissions on PC, laptop, and mobile.
- Test one-device write -> second-device/fresh-session read.
- Test focus/visibility/poll fallback.
- Confirm stale tabs converge back to server state.

### Cross-module synchronization
- Verify downstream modules refresh/recalculate after shared business facts change.
- Check inventory/procurement, reservations/preparation/staffing, SOP/training/skills and other affected dependencies.

### Branch parity
- Verify equivalent functions remain consistent for Central Kitchen, Fuxing and Yongji unless an explicit exception exists.

### Internationalization and search
- Verify Vietnamese mode remains Vietnamese + Traditional Chinese.
- Verify Chinese terminology follows Taiwan restaurant/operations usage.
- Check newly added labels are present in translation catalogs.
- Verify search across Chinese, Vietnamese, accentless Vietnamese, Pinyin, and Zhuyin where relevant.
- Test long translated labels at mobile widths.

### Responsive UI
- Review desktop, laptop, and the documented mobile breakpoint matrix.
- Check touch targets, keyboard inputs, modals, tables, overflow, safe areas, and landscape mode.
- Prioritize readability of item names, quantities, units, status, error/success feedback and primary actions.

### Interaction feedback
- Verify each edited button/action has an observable result.
- Verify pending/loading state where required.
- Verify validation, permission, API/network and persistence failures are visible to the user.
- Verify duplicate critical submissions are prevented.

### Performance
- Check for repeated full-page renders, MutationObserver loops, duplicate subscriptions, memory leaks, and unnecessary network calls.
- Debounce high-frequency search/input events.
- Avoid repeated API queries when cached data is still valid.
- Confirm Service Worker does not serve mixed release versions.

### Browser/PWA compatibility
- Test normal and incognito/private browsing behavior where relevant.
- Verify service-worker update/activation path.
- Check offline/cache fallback does not become an alternative source of truth.
- Verify forms and native controls remain functional across desktop/mobile browsers.

### Security
- Never expose database credentials or secret keys to browser or repository.
- Validate inputs at server/database boundary.
- Confirm disabled users and insufficient roles cannot mutate protected data.
- Keep core runtime business data under VPS control.

### Release discipline
Before calling an update complete:
1. Review all edited files and adjacent dependencies.
2. Run syntax validation on edited JavaScript/TypeScript modules.
3. Review SQL migration syntax and permission implications.
4. Bump release/cache/service-worker version consistently.
5. Check app shell references all required new modules.
6. Verify no new module was created but forgotten in index/service worker.
7. Check PC/laptop/mobile consistency.
8. Check auth, permission, language, data sync and inventory mutation flows.
9. Check button success/error behavior and database round-trip.
10. Check cross-module synchronization and branch parity.
11. Update documentation/migrations.
12. Commit the complete change set to GitHub.
13. Record any known limitation explicitly instead of silently deferring it.

A change is not considered complete if it works only on the device, page, module or branch where it was implemented.
