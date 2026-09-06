# SDD Delta — Stable Shell Render Slice

Date: 2026-09-06
Status: specification / acceptance design
Priority: P1 architecture performance

## Problem

`render()` currently replaces `#app.innerHTML` with the complete application shell on every authorized render. Even when only page-local state changes, this rebuilds sidebar, topbar, main-shell, mobile navigation and modal hosts. The previous phases already coalesce repeated renders and suppress a redundant subscribed render after an explicit render, but each remaining render is still whole-app DOM replacement.

## Goal

Introduce the first reversible slice toward granular rendering: preserve stable shell containers when the authenticated shell already exists, while keeping page output and all existing delegated events semantically identical.

## Scope of this slice

Only shell/container lifetime. Do not redesign page components or business state.

Stable containers targeted for preservation:
- `.app-shell`
- `.main-shell`

Sections that may still be replaced as complete fragments in this first slice:
- `.sidebar`
- `.topbar`
- `.page-content`
- `.mobile-nav`
- add-item modal host
- management modal host

This slice therefore reduces top-level DOM churn first without claiming final granular rendering.

## Required behavior

1. First authorized render remains equivalent to the current full render.
2. Later renders on an existing authorized shell preserve the identity of `.app-shell` and `.main-shell`.
3. Sidebar/topbar/page/mobile-nav markup remains byte-equivalent in visible behavior to the current templates.
4. Route changes still replace page content correctly.
5. Calendar, modal, account permission state, inventory operation mounts, inventory history async mounts and search re-application still execute after every relevant render.
6. Delegated root event listeners remain attached once and continue to work.
7. Logout/auth loss still clears the root completely.
8. No business-store, autosave, pending-draft, revision, inventory database or permission semantics change.
9. No native DOM prototype monkey-patching.
10. If the expected shell structure is absent/corrupt, renderer falls back to a full shell render rather than attempting a partial patch.

## Acceptance tests before implementation

Browser regression must verify:
- capture `.app-shell` and `.main-shell` DOM references after login;
- perform a page-local render-only interaction (e.g. open/close calendar or filter tab);
- references remain strictly identical after the interaction;
- visible UI changes correctly;
- perform a store-backed mutation and references still remain identical;
- navigate to another route and references remain identical while `.page-content` changes;
- open and close management/add-item modal without orphaned modal DOM;
- logout/auth-expired clears root;
- desktop and 320/359/390/412 mobile widths have no overflow regression.

Static/runtime contract must verify:
- no assignment of complete `#app.innerHTML` occurs on the stable-shell update path;
- fallback full-render path remains present;
- post-render hooks (`applyAccountEditState`, inventory search restore, inventory operation/history mount) remain called.

## Out of scope

- fine-grained row/component diffing;
- virtual DOM framework migration;
- changes to `store.update()` semantics;
- database/schema/API/auth changes;
- inventory transaction changes;
- production load/stress testing.

## Rollback

The slice must remain independently revertible to the current full `root.innerHTML` render behavior without data migration.
