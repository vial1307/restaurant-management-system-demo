# SDD Delta — UI render coalescing

Date: 2026-09-06
Status: IMPLEMENTATION CANDIDATE
Priority: P1 safe performance hardening

## Problem

The current application subscribes `renderWhenAuthorized` directly to the shared store. Every store persistence notification can therefore rebuild the full `#app` shell, including sidebar, topbar, page content and mobile navigation. Synchronous mutation bursts can cause repeated layout/style work inside one browser frame.

Business-state synchronization is also a store subscriber and must continue to observe every mutation immediately so pending-draft capture and PostgreSQL autosave semantics remain correct.

## Scope

This delta introduces a compatibility layer around the existing store subscription API:

- preserve the existing store implementation and persistence behavior unchanged;
- preserve all store exports and public methods;
- keep non-UI subscribers synchronous and one-notification-per-mutation;
- coalesce only the existing named application UI subscriber `renderWhenAuthorized` to at most one callback per animation frame;
- the coalesced callback receives the latest state/arguments from the burst;
- initial/manual calls to `renderWhenAuthorized()` remain unchanged and immediate;
- unsubscribing the UI listener cancels a queued callback;
- use a timer fallback when `requestAnimationFrame` is unavailable.

The compatibility adapter is intentionally narrow. It does **not** replace the pending whole-app granular-render architecture refactor.

## Out of scope

- no database/schema change;
- no inventory semantics change;
- no auth or permission change;
- no business-state save/draft/conflict change;
- no route/output/template change;
- no change to explicit `render()` calls from modal/navigation handlers;
- no component framework migration;
- no host/VPS infrastructure change.

## Acceptance criteria

1. Two or more synchronous store mutations trigger every non-UI subscriber once per mutation.
2. The same burst schedules at most one UI render callback before the next animation frame.
3. The UI callback observes the latest store state from the burst.
4. A later mutation after the previous frame schedules a new UI callback normally.
5. Unsubscribing before a queued frame prevents that queued UI callback from running.
6. Initial application rendering remains immediate because `app.js` still invokes `renderWhenAuthorized()` directly after subscription.
7. Business-state autosave/draft tests remain green, proving render batching did not batch persistence subscribers.
8. Existing Chromium, Firefox and WebKit regression suites remain green.
9. No production deployment occurs from the feature branch; only a tested `main` SHA may deploy.

## Implementation boundary

`src/store-core.js` is an exact copy of the pre-change store implementation. `src/store.js` becomes a thin compatibility facade that re-exports the core API and wraps only the UI render subscription. `src/render-coalescer.js` owns the frame scheduler and is independently regression-tested.

The facade identifies the current UI subscriber by the stable source-level function name `renderWhenAuthorized`. The app is shipped as unminified native ES modules, so this is deterministic in the current architecture. Replacing this tactical adapter with an explicit granular subscription API belongs to the separately approved whole-app render refactor.
