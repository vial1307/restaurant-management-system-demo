# Kitchen OS — Frontend, Data and VPS Runtime Rules

Status: mandatory canonical rules for all future frontend, UI, interaction, synchronization, branch and persistence changes.

These rules apply to every module unless a later explicit specification states a narrower exception.

## 1. Bootstrap-standard responsive UI

All text, buttons, forms, cards, modals, tables, badges, alerts and navigation controls must follow Bootstrap-style responsive/component principles.

Rules:

- Layout must auto-fit the active device width rather than assume one fixed screen size.
- Typography and control sizing must scale appropriately across desktop, laptop, tablet and mobile breakpoints.
- Long labels, bilingual text and unusually long user-entered text must remain readable.
- Important text must not be hidden merely to preserve a compact layout.
- Buttons must not shrink until their labels become unreadable.
- Prefer wrapping, responsive stacking, flexible widths, `min-width: 0`, safe overflow handling and breakpoint-specific layout changes over clipping text.
- Critical actions must remain visible and reachable without horizontal clipping.
- Touch targets must remain practical on phones.
- Inputs must use mobile-safe font/control sizing so mobile browsers do not unexpectedly zoom the page.
- Desktop may use denser layouts, but desktop and mobile must expose the same functional capability unless the product specification explicitly says otherwise.

If Bootstrap is used as a library, its assets must be self-hosted with the application/repository and served through Kitchen OS infrastructure. Do not add a runtime dependency on a third-party Bootstrap CDN.

Representative verification widths include:

- <=359px
- 360–389px
- 390–429px
- 430–599px
- 600–760px
- tablet/laptop widths
- desktop widths
- phone landscape

## 2. Every interactive control must produce an observable result

No button, submit control or action may be considered complete merely because it renders or receives a click event.

For every data-changing action:

1. user triggers the action;
2. UI enters a visible pending/loading/disabled state where duplicate submission is possible;
3. request is sent to the VPS API;
4. VPS validates authentication, permission, input and business rules;
5. VPS performs the database operation;
6. only after confirmed success may the UI show success;
7. on failure, the UI must show a useful error state/message and must not pretend the data was saved;
8. the visible state must reconcile with the VPS/database result.

Required feedback categories:

- pending / processing;
- success;
- validation failure;
- permission failure;
- network/API failure;
- database/server failure when distinguishable.

A local cache mutation is never sufficient evidence of successful persistence.

Critical mutations should prevent accidental duplicate submission while a request is in flight.

## 3. PostgreSQL on the VPS is the authoritative business database

All business data intended to survive refreshes, deployments or device changes must be persisted to PostgreSQL through the VPS API.

This includes, as applicable:

- accounts, roles and permissions;
- inventory/catalog/location/quantity/minimum data;
- inventory transactions and receive defaults;
- reservations;
- procurement/calling suppliers;
- preparation/checklists/assignments;
- menu/training;
- SOP/version/learning/inspection data;
- skills/evaluations;
- attendance/payroll data;
- schedules;
- reports/audit source data;
- remote-management job definitions;
- shared staff/business configuration;
- branch/site configuration.

`localStorage`, IndexedDB, service-worker cache or in-memory state may be used only for UI/cache/offline-support purposes. They must not become an alternative authoritative database for shared business data.

If offline editing is later supported, synchronization must explicitly reconcile with the VPS and resolve conflicts safely before the UI claims server persistence.

## 4. Cross-device UI, data and translation consistency

The same account and same site must converge to the same business state across supported devices.

Required consistency:

- visible modules;
- permissions;
- site/workplace;
- data values;
- audit/history;
- business rules;
- translation mode and translated labels;
- action availability;
- status/error/success semantics.

UI may rearrange responsively, but functional meaning may not change because of device type.

Translation requirements:

- Traditional Chinese uses Taiwan restaurant/operations terminology.
- Vietnamese mode remains Vietnamese + Traditional Chinese where defined by the product.
- New UI text must be added to the translation catalog; avoid hard-coded single-language control text.
- Translated labels must be tested for overflow/wrapping at mobile widths.
- Language preference should synchronize through the signed-in VPS account where the feature supports account preference.

## 5. Cross-module data synchronization

Modules that represent the same real-world business facts must stay synchronized.

Examples:

- inventory quantity changes must affect procurement/shortage calculations;
- inventory safety minimums must affect alerts and factory-order planning;
- reservations must affect preparation targets and staffing/load evaluation where specified;
- SOP revisions must affect training/qualification status;
- schedules and employee skills must affect staffing-capacity assessment;
- shared staff/configuration changes must be reflected wherever those entities are referenced.

Do not duplicate the same business fact into independent unsynchronized state stores.

When one module changes a shared entity, dependent modules must consume the same canonical server-backed state or a deterministic derived state.

## 6. Branch functional parity

Central Kitchen, Fuxing and Yongji must share the same implementation pattern and functional semantics for equivalent features unless the specification explicitly defines a branch-specific exception.

Rules:

- Do not fix a common branch feature in only one branch implementation when the same rule applies to the others.
- Do not silently give one branch an older or reduced version of shared controls.
- Shared inventory actions, save behavior, validation, feedback, responsive behavior and translation behavior must remain consistent across sites.
- Branch-specific storage layouts, permissions or workflow differences are allowed only when explicitly specified.

Every branch-related change must include a parity review for all affected sites.

## 7. VPS-only runtime authority

Kitchen OS runtime business processing must remain under infrastructure controlled by the project:

`Browser/UI -> Kitchen OS VPS API -> PostgreSQL`

Rules:

- Browser code must not connect directly to PostgreSQL.
- Do not introduce Supabase, Firebase or another hosted backend as a parallel authoritative runtime layer without an explicit architecture change.
- Do not rely on third-party services for core authentication, permissions, inventory mutation, business-state persistence or critical synchronization when the VPS can own the function.
- Third-party libraries may be used only as code dependencies when appropriate; they must not become a hidden authoritative business-data processor.
- Prefer self-hosted/static dependencies for critical UI/runtime assets where practical.
- GitHub is the approved external service for source-code storage, version history, CI/CD workflow and deployment source.

Any future external service integration must document:

- purpose;
- data sent externally;
- failure mode;
- whether it is authoritative or optional;
- removal/migration path.

Core Kitchen OS operations must continue functioning under VPS control if that optional integration is unavailable, unless an explicit future specification changes this rule.

## 8. Mandatory acceptance criteria for every frontend mutation

A changed or new action is not DONE until all applicable checks pass:

- control is visible and usable on desktop and representative mobile widths;
- long Traditional Chinese/Vietnamese labels remain readable;
- click/tap produces visible pending state when appropriate;
- invalid input produces an explicit validation message;
- unauthorized action is rejected by VPS/backend, not only hidden in UI;
- successful action is confirmed by VPS/API;
- database round-trip confirms persisted data;
- refresh/relogin does not lose the saved business value;
- a second device/fresh session reads the updated value when the data is shared;
- failure does not leave fake success or permanently diverged local state;
- dependent modules recalculate/refresh correctly;
- branch-equivalent functionality remains consistent;
- translation works and does not break responsive layout.

## 9. Release rule

Any frontend change that violates one of these invariants is incomplete even if the edited page appears visually correct.

The release must be marked `NOT DONE` until the violated rule is fixed or an explicit specification exception is approved and documented.
