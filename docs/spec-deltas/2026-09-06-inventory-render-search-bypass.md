# Inventory render search bypass — SDD delta

## Problem
`render()` currently calls `applyInventorySearchDom()` on every inventory-page render whenever the search input exists. When the search value is empty or normalizes to an empty needle (for example whitespace), the rendered inventory markup is already unfiltered, yet `applyInventorySearchDom()` still walks every inventory group and row, updates hidden flags and counts, and resolves the translated items label. This adds avoidable CPU work to inventory quantity changes, cloud refreshes, date changes and other renders where no search filter is active.

## Scope
Frontend render performance only. No database, API, auth/permission, business persistence, inventory mutation, search matching vocabulary, pinyin/注音/Vietnamese semantics, or direct input-event behavior may change.

## Design
1. Keep `applyInventorySearchDom(input)` unchanged as the direct input/search/composition handler so clearing a live filter still immediately unhides rows and restores group counts.
2. In `render()`, after locating the inventory search input, reapply the DOM search only when `prepareSearchNeedle(input.value)` is non-empty.
3. Empty or whitespace-only render-time search skips the row/group scan because fresh inventory markup is already unfiltered.
4. Programmatic search resets that call `render()` remain safe because the rendered input value changes and stable-shell replaces/patches the page to the unfiltered markup.

## Acceptance
- `render()` must not unconditionally call `applyInventorySearchDom()` merely because the inventory search input exists.
- Render-time reapply must be guarded by a normalized prepared needle, so both `""` and whitespace-only search bypass the inventory row scan.
- Direct `input`, `search`, and `compositionend` handlers must continue calling `applyInventorySearchDom()` so clearing search immediately removes the live filter without waiting for another render.
- Existing prepared-search semantics and search-evaluation token behavior remain unchanged.
- Existing desktop/mobile Chromium and Firefox/WebKit regressions remain mandatory before merge.
- Production still requires exact-SHA deploy health and production UI smoke.

## Non-goals
- No debounce or delayed typing feedback.
- No changes to inventory rendering structure.
- No stable-shell parsing shortcut.
- No persistent search index or additional browser storage.
