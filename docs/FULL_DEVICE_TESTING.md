# Kitchen OS Full Device Testing Contract

Status: mandatory for frontend changes.

This document defines the automated device/browser contract required before a frontend release can deploy to the VPS.

## 1. Goal

A frontend change is not complete merely because it works on the developer's current browser. Shared capabilities must remain usable, readable and functionally equivalent across supported screen classes and browser engines.

## 2. Browser engines

Automated CI must exercise:

- Chromium: Chrome/Edge/Android-Chrome class behavior.
- Firefox: Firefox desktop behavior.
- WebKit: Safari/iPhone/iPad class behavior.

Physical-device smoke tests remain useful for major releases, but the automated engine matrix is the mandatory baseline for every frontend update.

## 3. Device boundary profiles

The automated matrix uses representative boundary sizes rather than individual phone models:

- 320x568 — very small mobile.
- 390x844 — iPhone-class mobile.
- 412x915 — Android-class mobile.
- 844x390 — mobile landscape.
- 820x1180 — tablet.
- 1366x768 — laptop.
- 1440x900 — desktop.

Existing Chromium regression also retains 359x740, 390x844 and landscape coverage.

## 4. Mandatory checks

Every supported profile must satisfy the applicable checks below:

1. No whole-document horizontal overflow beyond a 3px tolerance.
2. Interactive controls remain visible and have usable geometry.
3. Button/input/select text must not become unreadably small.
4. Long bilingual Chinese/Vietnamese labels must wrap/reflow instead of clipping or expanding the whole page.
5. Shared navigation and module capabilities must remain present on mobile and desktop.
6. Inventory operation tabs must expose the same shared capabilities on supported devices.
7. Product-save actions must remain visible inside the viewport.
8. Account/permission modals must stay inside the visual viewport.
9. Language switching must remain usable in Traditional Chinese and Vietnamese.
10. Mobile orientation changes must not unmount the application or change the current route.
11. Page-level JavaScript errors fail the test.
12. Critical device screenshots are retained as CI artifacts for diagnosis.

## 5. Test layers

### Layer A — static and syntax guards

Catches missing files, invalid JavaScript and forbidden architectural regressions.

### Layer B — API/PostgreSQL regression

Validates authentication, permissions, inventory mutations, persistence and database transaction behavior against an isolated PostgreSQL service.

### Layer C — Chromium functional regression

Runs the broad existing role/permission and desktop/mobile workflow suite.

### Layer D — full-device cross-browser regression

Runs `tests/full-device-regression.mjs` against Chromium, Firefox and WebKit with the boundary profiles above.

### Layer E — production smoke

Runs only after deployment succeeds and verifies the active production release rather than browser cache/local state.

## 6. Responsive implementation rules

- Prefer fluid width, grid/flex reflow and Bootstrap-compatible responsive behavior.
- Do not add fixed page/container widths that require a specific device model.
- Avoid fixed content heights for dynamic bilingual content.
- Use `min-width: 0` for flex/grid children that contain variable text.
- Use `overflow-wrap`, wrapping or stacked mobile actions before shrinking text below readable size.
- A table may have a scoped horizontal scroll container only when preserving the table is materially useful; the document itself must not scroll horizontally.
- Use dynamic viewport units where browser chrome/keyboard affects the visual viewport.
- Safe-area-sensitive bottom/top controls must account for device insets.

## 7. Feature parity rule

Responsive design may change presentation but not capability.

Example:

- desktop may show four action buttons;
- mobile may group the same four actions into a compact menu;
- mobile may not silently omit three actions.

Any intentional branch- or device-specific behavior requires an explicit approved specification change.

## 8. Long-text stress rule

Tests must deliberately use long bilingual labels. A UI that only passes with short fixture text is not considered responsive.

## 9. Screenshot artifacts

CI stores critical screenshots from the full-device run for seven days. These screenshots are diagnostic evidence, not the source of truth. Geometry and functional assertions remain the release gate.

## 10. Definition of Done

A frontend change is `DONE` only after:

- preflight passes;
- performance guards pass;
- API/PostgreSQL regression passes;
- Chromium functional regression passes;
- full-device Chromium/Firefox/WebKit regression passes;
- deployment passes;
- production smoke passes.

If any mandatory stage fails, the release status is `NOT DONE` and production must not be described as successfully updated.
