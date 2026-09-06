# SDD Delta — Inventory Search Fast Path

Date: 2026-09-06
Status: implementation candidate

## Problem

The main inventory search is already DOM-only, but the existing handler calls `currentContext()` once per visible inventory group only to obtain the localized `items` label. `currentContext()` also recalculates reservations, rice, generated tasks, inventory alerts, reserve summaries and staffing capacity. On mobile, this repeats unnecessary business calculations for every search keystroke.

## Scope

Optimize only `[data-field="inventorySearch"]` event handling. Do not change inventory data, business-state persistence, auth/permissions, route rendering, search matching semantics, pinyin/注音 support, or database/API behavior.

## Contract

1. Search still uses the canonical `searchMatches()` implementation.
2. The existing app handler must still receive each search event so `view.search` remains authoritative.
3. Before the existing bubble handler runs, a capture-phase fast path filters grouped inventory rows and updates group counts directly.
4. During that one event propagation only, grouped rows are temporarily excluded from the legacy `.inventory-group` loop so the legacy handler does not call `currentContext()` per group.
5. Group classes are restored at the next microtask checkpoint even if the search query is empty.
6. Empty-state visibility is corrected after the legacy handler completes.
7. IME composition remains unchanged: composing `input` events are ignored; `compositionend` applies the completed query.
8. Direct, ungrouped inventory rows remain handled by the legacy path.
9. The optimization must be independently removable without changing `app.js`.

## Acceptance

- Vietnamese, Chinese, Pinyin and Zhuyin search results remain identical.
- Group visible counts remain correct.
- Empty-state is shown only when a non-empty query has zero matches.
- Search query persists through the existing app state because the legacy handler still executes.
- No inventory/business save is triggered by searching.
- Desktop/mobile Chromium and Firefox/WebKit regressions remain green.
- No DB/schema/API/auth/inventory mutation changes.
