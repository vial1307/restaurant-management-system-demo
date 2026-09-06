# SDD Delta — inventory search scoped computation cache

Date: 2026-09-06
Status: IMPLEMENTATION CANDIDATE
Priority: P1 safe performance hardening

## Problem

`applyInventorySearchDom()` filters inventory rows directly in the DOM, but when it updates each visible group count it calls `currentContext().text.items`. `currentContext()` eagerly recalculates reservations, rice, generated tasks, reserve inventory and inventory alerts. During one search event the store state is unchanged, so these calculations are repeated once per inventory group even though only the translated `items` label is needed.

On mobile this unnecessary synchronous work happens for each typed search input event.

## Scope

Introduce an explicitly search-scoped computation token and a facade around the existing rules module:

- preserve the complete pre-change rules implementation byte-for-byte as `src/rules-core.js`;
- keep `src/rules.js` as the public import path and re-export the unchanged core API;
- `searchMatches()` marks the current synchronous search evaluation window;
- only while that search window is active, memoize repeated calls to the expensive context rules used by `currentContext()` when their arguments are the same by identity/value;
- clear the search window at the next microtask checkpoint;
- outside a search window, call the core rule implementation directly and preserve normal fresh-result behavior;
- do not cache inventory/store mutations, network state, permissions, business state or DOM output.

Initial memoized rules:

- `calculateReservations`
- `calculateRice`
- `buildGeneratedTasks`
- `summarizeReserveInventory`
- `buildInventoryAlerts`

`completionSummary` remains uncached because `currentContext()` constructs a new task array on each call and that computation is comparatively small.

## Safety contract

The cache is not a general state cache. It exists only for the synchronous inventory search path identified by `searchMatches()` and expires at the microtask boundary. A normal render, inventory adjustment, draft count, autosave, auth transition or later browser task therefore uses the core calculation functions normally.

Cached values are returned only when both the active search token and function arguments match. No JSON serialization or deep state fingerprinting is introduced.

## Out of scope

- no database/schema/API change;
- no inventory mutation semantics change;
- no business-state persistence change;
- no auth/permission change;
- no search matching/phonetic behavior change;
- no change to inventory DOM filtering/count output;
- no component/granular-render architecture refactor;
- no persistent cross-event memoization.

## Acceptance criteria

1. Search matching results remain identical for Vietnamese, Chinese, pinyin and zhuyin queries.
2. Calling a memoized rule twice with the same arguments during one search window returns the same computed result reference, proving the second expensive calculation was skipped.
3. Different arguments in the same search window do not reuse the wrong result.
4. After the microtask checkpoint, the same rule call executes through the normal core path and returns a fresh result reference.
5. Without any active search window, consecutive calls preserve pre-change fresh-result behavior.
6. The complete original rules implementation is retained unchanged in `rules-core.js`.
7. Existing store/business persistence/runtime tests remain green.
8. Existing Chromium desktop/mobile and Firefox/WebKit full-device regressions remain green.
9. Feature-branch CI must not deploy production; only a tested main SHA may deploy.