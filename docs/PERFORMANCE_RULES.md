# Kitchen OS — Performance and Frame-Stability Rules

Status: mandatory engineering rules for every frontend/data-sync change.

## 1. Performance is part of correctness

A feature is not DONE if it is functionally correct but causes visible lag, frame drops, layout jumps, repeated flashes, unnecessary full-page reloads, duplicated renders, or avoidable network/database refreshes.

Performance review is mandatory whenever a change affects:

- navigation or route switching;
- inventory/site switching;
- data entry or save flows;
- VPS synchronization;
- focus/visibility refresh;
- translation/UI patching;
- modals, large tables or long inventory lists;
- mobile layout;
- service-worker/cache/release behavior.

## 2. Data updates

When a user changes data:

- do not rebuild unrelated parts of the application unnecessarily;
- coalesce repeated UI work into the same animation frame where practical;
- do not trigger duplicate API requests for one user action;
- do not reload unchanged VPS state into the client merely because the window regained focus;
- compare server revision/version/snapshot where available before merging remote state;
- unchanged polling/focus refresh must not cause a visible page repaint or full application render;
- pending/success/error UI must remain responsive while the request is in flight.

## 3. Navigation and module switching

Switching Dashboard, Inventory, Procurement, Reservations, Preparation, Menu, SOP, Skills, Attendance, Schedule, Reports, Remote and Settings must not perform a browser-level page reload.

Navigation must:

- keep one canonical application session;
- avoid unnecessary duplicate API calls;
- avoid scroll jumps caused by unrelated state updates;
- avoid flashing the login screen or an empty shell;
- avoid rebuilding large unrelated DOM trees where a smaller update is sufficient;
- preserve the same feature availability on desktop and mobile.

The current legacy full-root render architecture is considered technical debt. New code must not increase dependence on whole-application rerenders, and future refactoring should move toward route/page-level or component-level updates.

## 4. MutationObserver and DOM patching

Observers used for translation, permissions, responsive fixes or compatibility layers must never create feedback loops.

Rules:

- an observer must not recursively react to DOM mutations produced by its own patch operation;
- batch DOM patching with `requestAnimationFrame` or another deterministic scheduler where appropriate;
- disconnect/suppress observation while applying self-generated DOM patches when needed;
- avoid whole-document text scans after small local changes;
- prefer canonical translated/rendered markup over repeated post-render DOM rewriting for new code.

## 5. VPS synchronization

Focus, visibility, polling and active-site refreshes exist to converge data, not to force repaint.

Rules:

- use server revision/version information to skip unchanged merges;
- only merge/render when authoritative business data actually changed;
- a focus event may perform a lightweight freshness check, but unchanged data must not replace the current UI tree;
- inventory polling must not rerender when quantities/catalog have not changed;
- repeated focus/visibility events must not create concurrent duplicate refreshes;
- stale requests must not overwrite newer results.

## 6. Mobile frame stability

Mobile review is mandatory because lower-powered phones expose unnecessary rendering work more clearly.

Check at representative widths and phone landscape for:

- scroll smoothness;
- tab/route switching;
- opening/closing modals;
- inventory search and filters;
- +/- quantity controls;
- save/update operations;
- switching Central/Fuxing/Yongji;
- returning to the app after backgrounding it;
- bilingual long labels.

No critical control may move unpredictably because asynchronous data arrived unless the layout change is required by the new authoritative data.

## 7. Required regression checks

Every release with frontend/sync changes must verify all applicable items:

1. no browser-level reload during normal route or warehouse switching;
2. unchanged inventory poll does not trigger full page render;
3. unchanged business-state revision after focus does not merge/rerender the app;
4. translation/DOM observers do not create self-triggered mutation loops;
5. inventory search filters locally without rebuilding the whole application on each keystroke;
6. data-save operations remain responsive and show pending/success/error states;
7. desktop and mobile produce the same business result;
8. no new console/page errors;
9. production smoke test passes after deployment.

## 8. Performance incidents

If a user reports lag, stutter or frame drops:

- reproduce the exact flow if possible;
- identify whether the cost is DOM rendering, JavaScript, network/API, database, translation patching, cache/service worker or layout;
- fix the root cause rather than adding arbitrary delays;
- add a regression check for the discovered cause;
- record any remaining structural limitation explicitly.

A performance issue that materially affects normal restaurant operation keeps the affected release/feature at `NOT DONE` until fixed or explicitly accepted as a known limitation.
