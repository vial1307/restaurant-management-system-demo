# Inventory search label context — SDD delta

## Problem
`applyInventorySearchDom()` updates every inventory group for each search keystroke. The group-count label currently evaluates `currentContext().text.items` inside the per-group callback, so context/translation work repeats once per group even though the label is identical for the whole search event.

## Scope
Frontend performance only. No database, API, auth/permission, business persistence, inventory mutation, search matching, pinyin/注音/Vietnamese matching, or displayed-count semantics change.

## Required behavior
1. Resolve the translated inventory `items` label once per `applyInventorySearchDom()` invocation, before iterating inventory groups.
2. Reuse that label for every group count.
3. Do not call `currentContext()` inside the per-group callback.
4. Preserve search query state, row/group visibility, loose-row handling and empty-state behavior exactly.
5. Existing full desktop/mobile/cross-browser regression remains mandatory before merge; production still requires exact-SHA deploy health and UI smoke.

## Acceptance
A static performance regression must locate `applyInventorySearchDom()`, require a pre-loop `itemsLabel = currentContext().text.items` binding, require group-count text to use that binding, and reject `currentContext()` from the group iteration body.