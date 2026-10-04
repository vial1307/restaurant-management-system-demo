# Kitchen OS Feature Registry

Version: 1.0  
Purpose: map features to authority, user surfaces, verification obligations and high-risk invariants.

This is a registry, not a replacement for source inspection. Update it whenever a feature gains a new authority boundary, user flow or mandatory regression.

| Feature | Runtime authority | Primary surfaces | Critical invariants | Minimum verification |
| --- | --- | --- | --- | --- |
| Inventory / Kho | PostgreSQL + Inventory API | Website Inventory, Central/branch views, Super Admin DB | no hard-coded catalog; site/location isolation; quantity mutations audited; Work Area/site semantics preserved | inventory DB/API regression, mutation round-trip, Desktop/mobile browser, F5/persistence for changed mutations, full-device, production Inventory audit |
| Work Area / Master Data | PostgreSQL master data | Inventory Work Area, Super Admin Database | site-scoped configuration; no branch layout copying; rename/archive does not orphan inventory | master-data round-trip, browser reload persistence, cross-view sync |
| Branch / Site Registry | PostgreSQL sites | Website site switch, Super Admin Stores/RBAC | site isolation; no missing branches; stale frontend fallback prohibited | site-switch isolation, RBAC scope, browser navigation/no reload |
| Users / RBAC | PostgreSQL app_users/roles/permissions | Login, Settings, Super Admin Users | positive + negative permission behavior; assigned site valid; persisted after reload | API role regression, Super Admin browser create/edit/reload, restricted-role verification |
| Workforce | PostgreSQL relational workforce data | Attendance, schedule, requests, Super Admin | relational read authority; approvals/request state persistent | workforce API + publication contracts, request/approval browser, production parity/backfill |
| Reservations / Preparation | PostgreSQL/API | Reservation, preparation/dashboard surfaces | reservation state remains DB-backed; related prep state stays consistent | targeted API/persistence regression + browser path |
| SOP / Content | PostgreSQL/API | SOP, announcements, media, Super Admin Content | draft/approval lifecycle; site scope; audit | CRUD/API checks, role checks, reload persistence |
| Super Admin | Protected API + PostgreSQL | `.admindev.html` | no arbitrary host shell; protected actions; DB authority; no browser secret exposure | static regression, Super Admin browser regression, mobile/desktop overflow/pageerror, F5 persistence |
| GitHub & Handoff | GitHub main handoff + live GitHub API + VPS runtime | Super Admin Development | `ACTIVE_PR` explicit; exact-head evidence; runtime release not inferred from main docs | harness contract regression, live workflow mapping, production release gate |
| AgentMemory | VPS-local AgentMemory persistent store | Super Admin GitHub & Handoff | recall only; GitHub/PostgreSQL authoritative; no public REST; VPS-only secret | health, authenticated recall, persistent seed, deploy smoke |
| Deployment | GitHub Actions + VPS deploy scripts | CI/Actions, VPS | exact tested SHA; backup/rollback; release/schema verified | Deploy workflow, health, DATA_INTEGRITY_OK, production UI smoke |

## Interaction classes

When a feature exposes any of these controls, the engineer must explicitly verify the relevant class:

- buttons / links / tabs;
- dropdowns / selects;
- lists / filters / sorting / pagination;
- forms / validation / save;
- modals / dialogs;
- add/edit/archive/delete actions;
- quantity +/- controls;
- site/warehouse switches;
- role/permission switches;
- navigation / route transitions.

## Change-risk levels

### UI-only
No business/API/schema behavior changes. Still requires interaction, pageerror, responsive and unexpected-reload verification.

### Runtime logic
Requires targeted API/browser regression plus full release gate.

### Business-data mutation
Requires API -> PostgreSQL -> reload/F5 persistence evidence and audit integrity.

### RBAC
Requires allowed and denied role/site cases.

### Database/schema
Requires migration safety, backup, API compatibility, integrity and production schema verification.
