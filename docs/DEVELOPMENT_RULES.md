# Kitchen OS — Development Rules

These rules are mandatory for every future feature, fix, refactor, and UI update.

## 1. One account system / SSO-ready architecture

- Supabase Auth is the current identity source.
- Authentication, session, role, workplace, permissions, and user preferences must not depend on one browser's localStorage.
- New code must remain portable to a future VPS deployment.
- Do not hard-code provider-specific behavior into UI components. Keep auth/data access behind dedicated modules so Supabase can later be replaced or fronted by VPS services.

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
- Prefer Realtime where useful, plus focus/visibility refresh and periodic fallback synchronization.
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

## 7. Migration to VPS

New modules should be designed so migration can happen incrementally.

Keep these boundaries:
- UI
- auth/session
- API/data access
- realtime/sync
- database schema/migrations

Avoid coupling pages directly to Supabase internals when a small data-service abstraction can be used.

Future VPS target can replace:
- Supabase Auth -> VPS/OIDC-compatible identity service if desired
- Supabase Database/RPC -> PostgreSQL + backend API
- Supabase Realtime -> WebSocket/SSE service

The UI and permission model should require minimal changes.

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
