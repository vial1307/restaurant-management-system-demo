# 2026-09-18 — Super Admin Panel v2

## Purpose

`admin.html` is a standalone system-administration console for the platform owner / Super Admin. It is not a second copy of the normal Kitchen OS management UI.

Normal users, managers and ordinary `admin` accounts continue to use Kitchen OS modules according to their database-driven permissions. The Super Admin console is reserved for accounts with capability `system.super_admin`.

## Access model

- Add role `superadmin` above the existing `admin` role.
- `superadmin` has global scope and inherits/receives full application module access.
- Only `superadmin` receives capability `system.super_admin`.
- Existing owner account `yangchuadmin` is promoted to `superadmin` during migration so the owner is not locked out.
- The compatibility role presented to legacy Kitchen OS UI remains `admin` so existing operational admin behavior is preserved.
- Ordinary `admin` keeps account-management and operational-master-data capabilities but cannot enter the standalone Super Admin Panel unless explicitly promoted.

## Super Admin Panel information architecture

The standalone panel contains only system-level administration:

1. **Overview / VPS**
   - API health and release
   - PostgreSQL health, schema version, database name/version/size and connection count
   - API process uptime and Node runtime/memory information
   - latest backup
   - high-level counts (users, sites, products, SOP, audit rows)

2. **User & RBAC management**
   - Direct PostgreSQL-backed list/create/update/archive of accounts through authenticated VPS API
   - Role/workplace assignment
   - Per-user permission override matrix for every active application module (`view`/`edit`)
   - Password reset and active/inactive state
   - Access-model data is read from `account_roles`, `permission_modules` and `permission_capabilities`
   - Effective permissions are role permissions merged with explicit per-user overrides; `edit=true` can never be effective while `view=false`

3. **Content administration**
   - announcements
   - SOP documents and pending SOP-version approval/rejection
   - inventory products / menu products
   - media/image metadata
   - all writes go through Super Admin API and create audit records

4. **Data Tables & CRUD**
   - Server-backed tables with search, filters, sorting and pagination
   - Only an explicit server-side whitelist of tables/columns is exposed; no arbitrary SQL from browser
   - Create/update/archive/delete behavior follows referential-integrity rules for each dataset

5. **Multi-store management**
   - List/create/configure/activate/deactivate sites
   - Site code is immutable after creation
   - Site metadata includes names, timezone, currency, ordering and optional business metadata
   - Inventory synchronization/transfer remains handled by canonical inventory APIs, not direct quantity rewrites
   - Menu rows are site-scoped and may hold site-specific prices; Super Admin may copy/synchronize menu data between sites while preserving intentional destination overrides when requested

6. **System Settings**
   - Website/system settings persist in `system_settings`
   - Site-specific settings continue to persist in `site_settings`
   - No settings success is shown before PostgreSQL confirmation

7. **Logs & Reports**
   - Paginated/searchable/filterable `audit_logs`
   - Export audit data in an Excel-compatible tabular file and a PDF report
   - exports use the same filtered dataset scope enforced by the server

## New shared data

- `system_announcements`: global or site-scoped announcements with draft/published/archived lifecycle.
- `media_assets`: metadata for uploaded/externally-hosted images/documents, optionally linked to business entities.
- `menu_items.price` and `menu_items.currency_code`: site-specific price data.

Actual binary media storage is not moved into PostgreSQL. PostgreSQL stores metadata/URLs; a future storage service may provide the binary object while VPS/PostgreSQL remain authoritative for metadata and relationships.

## Security invariants

- Browser never connects directly to PostgreSQL.
- Every Super Admin endpoint requires an authenticated session and `system.super_admin` capability.
- Dynamic CRUD uses server-defined table/column whitelists and parameterized values.
- Sensitive account/site/content/settings/data writes create `audit_logs` records.
- Normal `admin`, manager and user accounts cannot access Super Admin endpoints.
- Existing Kitchen OS permissions, inventory atomicity and branch-scope rules remain unchanged.

## Acceptance criteria

1. `admin.html` rejects an ordinary `admin` account and allows `superadmin`.
2. Owner account remains able to open the panel after migration.
3. VPS overview reads live API/PostgreSQL values.
4. User editor reads roles/modules from DB and saves per-user module overrides to `app_users.permissions`.
5. Fresh sessions receive merged effective permissions from role + user override.
6. Super Admin can manage sites and system settings with confirmed PostgreSQL persistence.
7. Data tables support query, site/status filters where applicable, sorting and pagination.
8. Announcements/media/products/SOP records are visible through the content/data-management surfaces.
9. SOP approval/rejection updates the relational SOP version and audit log atomically.
10. Audit log screen can export the selected/filterable dataset as Excel-compatible and PDF reports.
11. Admin Panel remains responsive on desktop/mobile without exposing normal day-to-day Kitchen OS screens inside the console.
