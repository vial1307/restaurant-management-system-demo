# SDD Delta — suppress redundant subscribed render after explicit render

Date: 2026-09-06
Status: IMPLEMENTATION CANDIDATE
Priority: P1 safe performance hardening

## Problem

The application now coalesces the named store UI subscriber `renderWhenAuthorized` at the microtask boundary. Some interactions still mutate the store and then call the existing `render()` function synchronously in the same interaction. A concrete case is successful staff switching with a PIN: `store.switchStaff(...)` queues the subscribed UI render, then the management flow calls `render()` immediately. The queued subscriber then rebuilds the whole `#app` shell a second time at the microtask checkpoint.

Persistence subscribers must remain synchronous and must not be suppressed.

## Scope

Extend the existing UI-only coalescer contract so its caller may capture a render target identity when a UI callback is queued and decide at the microtask checkpoint whether the callback is still required.

For the application store facade:

- capture the current `#app.firstElementChild` identity when the first UI mutation in a synchronous burst queues a render;
- if that first child has been replaced before the queued microtask executes, treat that as an already-completed explicit whole-app render and skip the queued subscribed render;
- if the root child is unchanged, run `renderWhenAuthorized` normally;
- preserve the latest state arguments for ordinary coalesced renders;
- preserve unsubscribe behavior;
- preserve all non-UI subscribers and local persistence synchronously once per mutation.

The optimization is intentionally limited to the existing whole-app subscriber. It does not infer business state from DOM contents and does not compare or serialize `innerHTML`.

## Out of scope

- no database/schema/API change;
- no auth or permission semantics change;
- no inventory/business-state mutation change;
- no route/template/output change;
- no replacement of explicit `render()` calls;
- no component/granular-render architecture refactor;
- no inventory-search behavior change in this delta.

## Acceptance criteria

1. Two synchronous store mutations without an explicit render still produce exactly one subscribed UI render at the microtask checkpoint.
2. Persistence/non-UI subscribers still receive every mutation synchronously.
3. If `#app.firstElementChild` is replaced after a store mutation but before the queued UI microtask, the queued subscribed render is skipped.
4. A later mutation after that skipped callback can queue and execute a normal subscribed render.
5. Unsubscribe still makes an already queued callback inert.
6. The suppression check uses node identity only; it must not read, stringify or compare full DOM markup.
7. Existing desktop/mobile Chromium and Firefox/WebKit interaction regressions remain green.
8. Feature-branch CI must not deploy production. Only tested `main` may deploy exact SHA.

## Follow-up

Inventory-search context recomputation remains a separate hotspot. It is intentionally not bundled into this DOM-identity suppression change so any search-path optimization can be specified and regression-tested independently.