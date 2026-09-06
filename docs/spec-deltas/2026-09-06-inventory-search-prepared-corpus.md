# Prepared inventory search corpus — SDD delta

## Problem
Inventory search currently calls `searchMatches(row.textContent, query)` for every row on every keystroke. `searchMatches()` normalizes the same query repeatedly and rebuilds each row's pinyin/注音/phrase-alias search corpus repeatedly, including a scan of all phrase aliases. This is the dominant remaining CPU work in the mobile inventory search path.

## Scope
Frontend search performance only. No database, API, auth/permission, business persistence, inventory mutation, result ordering, matching vocabulary, pinyin/注音/Vietnamese semantics, or search-evaluation token semantics may change.

## Design
1. Add prepared search primitives in `search-utils.js`:
   - `prepareSearchNeedle(query)` normalizes a query.
   - `prepareSearchCorpus(text)` builds the existing source + phonetic aliases and normalizes it.
   - `preparedSearchMatches(corpus, needle)` performs inclusion matching and calls `markSearchEvaluation()` for a non-empty needle exactly as the current path does.
   - existing `searchMatches(text, query)` remains public and delegates to the prepared primitives so existing callers keep identical behavior.
2. In inventory search, normalize the query once per `applyInventorySearchDom()` call.
3. Cache each DOM row's prepared corpus in a `WeakMap` keyed by the row element. A rerender creates new row elements and therefore naturally invalidates the cache; detached rows remain collectible.
4. Both grouped and loose inventory rows use the prepared matcher.
5. Empty query remains an immediate match without opening a search-evaluation token.

## Acceptance
- Legacy `searchMatches()` and the prepared path return identical results for direct Chinese, contiguous/spaced pinyin, 注音, Vietnamese accent normalization, empty queries and non-matches.
- Prepared corpus contains the same phonetic/phrase aliases as the legacy path.
- Non-empty prepared matching preserves `markSearchEvaluation()` token behavior; empty matching does not create a token.
- Inventory search uses one prepared needle per event and a `WeakMap` corpus cache per DOM row.
- The inventory row loops no longer call `searchMatches(row.textContent, query)`.
- Existing desktop/mobile Chromium and Firefox/WebKit regression remains mandatory before merge. Production still requires exact-SHA deploy health and UI smoke.

## Non-goals
- No fuzzy-search algorithm changes.
- No changes to the phonetic dictionary or aliases.
- No debounce that could delay typing feedback.
- No persistent search index or browser storage.