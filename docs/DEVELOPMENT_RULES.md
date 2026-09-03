# Kitchen OS — Development Rules

These rules are mandatory for every future feature, fix, refactor, and UI update.

## 1. One account system / SSO-ready architecture

- VPS API + PostgreSQL is the only identity and permission source.
- Authentication, session, role, workplace, permissions, and user preferences must not depend on one browser's localStorage.
- New code must remain portable to a future VPS deployment.
- Keep provider-specific behavior behind the VPS API modules; UI components must not access PostgreSQL directly.

## 2. Cross-device consistency

Every change must be checked for:
- desktop PC
- laptop
- mobile phone
- common mobile widths and landscape mode

The same account must receive the same:
- role
- permissions
- workplace
- visible modules
- language preference
- inventory/business data
- history/audit data

Browser localStorage may be used only as cache/offline fallback, never as the authoritative shared database for multi-device business data.

## 3. Data synchronization

- Shared business data must use the cloud database as the source of truth.
- Use focus/visibility refresh and periodic polling until VPS SSE/WebSocket synchronization is introduced.
- Writes must be idempotent or auditable when possible.
- Inventory mutations must create transaction/audit records.
- Direct stocktake correction is restricted to supervisor/manager/admin and must record before/after values.
- Never silently overwrite cloud quantities from a stale device.

## 4. Language

Supported UI modes:
- Traditional Chinese (Taiwan)
- Vietnamese + Traditional Chinese

Requirements:
- Taiwanese restaurant/operations terminology should be used for Chinese labels.
- Search should support Chinese, Vietnamese, Vietnamese without accents, Pinyin, and Zhuyin where applicable.
- Language preference belongs to the signed-in account and must synchronize across devices.
- New screens must be added to the translation catalog; avoid hard-coded single-language labels.

## 5. Responsive UI

Every UI update must be reviewed at:
- <=359px
- 360–389px
- 390–429px
- 430–599px
- 600–760px
- desktop/tablet widths
- phone landscape

Priority:
- readable product names and quantities
- compact vertical spacing
- tap targets large enough for mobile
- no hidden/vanishing checkbox, select, input, or action controls
- no horizontal clipping of critical actions

## 6. Permissions

Permission checks must exist in both:
- UI visibility/interaction
- server/database authorization (RLS/RPC/backend)

Do not rely only on hidden buttons for security.

## 7. VPS architecture

All runtime modules must use the VPS API. Supabase runtime imports and direct browser database connections are prohibited.

Keep these boundaries:
- UI
- auth/session
- API/data access
- realtime/sync
- database schema/migrations

Avoid coupling pages directly to Supabase internals when a small data-service abstraction can be used.

Current stack:
- VPS session authentication
- PostgreSQL behind the Node.js API
- polling plus focus/visibility refresh
- optional future WebSocket/SSE without changing the UI permission model

## 8. Release checklist

Before publishing each version:
1. Check JavaScript syntax for edited modules.
2. Bump asset/service-worker version.
3. Confirm PC/laptop/mobile load the same release.
4. Check account permissions on at least two device classes.
5. Check language synchronization.
6. Check any changed business data is cloud-backed or explicitly marked local-only.
7. Check mobile layout at representative breakpoints.
8. Update SQL migration/setup docs when schema changes.
9. Commit all work to GitHub.


## 9. Post-update engineering review

After every update, fix, refactor, schema change, or deployment change, perform a full-system review rather than validating only the edited component.

Mandatory review areas:

### Architecture
- Verify module boundaries remain clean: UI, auth/session, permissions, data access, sync/realtime, database.
- Check for duplicated state sources and remove browser-only authoritative state.
- Check that new code does not create VPS migration lock-in.

### Authentication and authorization
- Test login/logout/session restore.
- Verify role, workplace, active/disabled account state, and per-module permissions.
- Verify authorization exists server-side/RLS/RPC, not only in UI.
- Test at least Admin plus one restricted account.

### Data integrity
- Verify shared data has a single cloud source of truth.
- Check optimistic/local updates cannot overwrite newer cloud values.
- Check audit trails for sensitive operations such as inventory correction.
- Verify database migrations are idempotent where practical.
- Check transaction boundaries for stock mutations.

### Cross-device synchronization
- Verify the same account gets the same data and permissions on PC, laptop, and mobile.
- Test one-device write -> second-device read.
- Test Realtime plus focus/visibility/poll fallback.
- Confirm stale tabs converge back to cloud state.

### Internationalization and search
- Verify Vietnamese mode remains Vietnamese + Traditional Chinese.
- Verify Chinese terminology follows Taiwan restaurant/operations usage.
- Check newly added labels are present in translation catalogs.
- Verify search across Chinese, Vietnamese, accentless Vietnamese, Pinyin, and Zhuyin where relevant.

### Responsive UI
- Review desktop, laptop, and the documented mobile breakpoint matrix.
- Check touch targets, keyboard inputs, modals, tables, overflow, safe areas, and landscape mode.
- Prioritize readability of inventory item names, quantities, units, status, and primary actions.

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
- Never expose secret/service_role keys to browser or repository.
- Validate inputs at server/database boundary.
- Review RLS/RPC policies after permission-related changes.
- Confirm disabled users and insufficient roles cannot mutate protected data.

### Release discipline
Before calling an update complete:
1. Review all edited files and adjacent dependencies.
2. Run syntax validation on edited JavaScript/TypeScript modules.
3. Review SQL migration syntax and permission implications.
4. Bump release/cache/service-worker version consistently.
5. Check app shell references all required new modules.
6. Verify no new module was created but forgotten in index/service worker.
7. Check PC/laptop/mobile consistency.
8. Check auth, permission, language, data sync, and inventory mutation flows.
9. Update documentation/migrations.
10. Commit the complete change set to GitHub.
11. Record any known limitation explicitly instead of silently deferring it.

A change is not considered complete if it works only on the device or page where it was implemented.
