# Mobile role × site release certification v2

Date: 2026-09-07
Base release: `bcf08fba21b3850fd2ba4e90f77a549790d97424`

## Problem

Kitchen OS has previously regressed so fixes and permissions available on desktop were missing, stale or unusable on mobile. Existing responsive coverage is broad but remains administrator-heavy; desktop role tests and API authorization tests do not prove the corresponding role-specific controls stay correct on phone layouts.

## Goal

Add a deterministic release gate for representative operational roles at mobile sizes. This is a certification/test slice only: it must not change authorization, inventory quantities, database schema or business semantics unless the certification exposes a separate product defect.

## Representative cases

Use existing isolated regression accounts only:

- Fuxing manager
- Yongji manager
- Fuxing supervisor
- Fuxing employee
- Fuxing part-time
- Central-kitchen account
- administrator

Run the complete role set in Chromium at 390/412px and additionally certify manager, employee and Central behavior in WebKit at iPhone-class 390px.

## Acceptance criteria

1. Authentication succeeds at the mobile viewport and the local session reports the expected role/location.
2. A stale/forged admin-active-site value cannot cause a site-scoped user to request another site's inventory API or render a usable foreign inventory view.
3. Inventory remains usable for every role that has inventory view permission.
4. Mobile navigation and the expanded mobile function menu reflect the session's actual module `view` permissions; tests must not hardcode obsolete role assumptions.
5. Branch manager receiving-default controls are editable only on the manager's own branch; supervisor/employee receive the same value read-only/disabled.
6. Direct quantity, storage minimum and work minimum controls follow stocktake authority on mobile: manager/supervisor/admin editable; employee read-only.
7. Part-time inventory remains read-only and must not expose mutation/catalog-management tabs.
8. Central-kitchen catalog management remains available while direct quantity/minimum stocktake controls remain read-only for the Central role.
9. Administrator can switch Fuxing, Yongji and Central on mobile without an access-empty state.
10. The tested page and inventory/product modal have no whole-document horizontal overflow beyond 3px.
11. Page-level JavaScript errors fail the certification.
12. The certification runs inside the existing full-device release gate before the general Chromium/Firefox/WebKit matrix.
13. Feature branches never deploy; production completion still requires exact-SHA VPS deployment and production UI smoke after merge.
