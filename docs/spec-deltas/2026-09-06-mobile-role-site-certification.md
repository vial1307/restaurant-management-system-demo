# Mobile role × site release certification

Date: 2026-09-06
Base release: `c7201a65338e5f83f487d3330d15525fbfda1b7a`

## Problem
The application has previously regressed so that fixes visible on desktop were missing or unusable on phones, especially around inventory/site selection and role-specific access. Existing cross-browser coverage is primarily administrator-oriented; API regression proves authorization but does not prove the corresponding mobile UI remains usable for each operational role/site.

## Goal
Add a deterministic mobile release gate that certifies representative authenticated roles against their authorized site on 390px and 412px viewports, while also proving that a forged/stale active-site value cannot move a scoped user into another branch.

## Representative accounts
Use only accounts already created by regression setup: `yangchuadmin`, `managerfx`, `manageryj`, `employeefx`, `centralreg`.

## Acceptance criteria
1. Every case authenticates through the browser auth layer at its mobile viewport.
2. The local session reports the expected role and location.
3. `#inventory` for the authorized site renders without `.access-empty-state`.
4. Branch users receive normal inventory controls; Central receives the dedicated Central inventory search surface.
5. Document horizontal overflow is no more than 3px at 390px/412px.
6. Pre-seeding a foreign active site for a scoped user must not yield a usable foreign-site inventory view; effective site returns to the account location.
7. A module the account cannot view must not expose a visible navigation link: manager→settings, employee→reports, central→dashboard.
8. Admin remains able to select Fuxing, Yongji, and Central on mobile.
9. The test runs after the existing desktop/mobile Chromium regression in the same isolated environment.
10. Feature branches never deploy; production still requires exact-SHA deploy/health and production UI smoke.

## Non-goals
No authorization, inventory, database, or business-state semantics change in this slice unless the certification uncovers a real product defect.