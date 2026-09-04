# Kitchen OS — Performance Audit 2026-09-05

Status: targeted remediation completed on audit branch; one structural P1 rendering issue remains for a controlled follow-up refactor.

## Scope reviewed

- data updates and saves
- route/module switching
- Central / Fuxing / Yongji switching
- inventory search/filtering
- inventory polling
- focus / background-resume synchronization
- bilingual UI post-processing
- browser reload/cache behavior
- mobile-sensitive rendering paths

## Findings

### PASS — warehouse switching does not reload the browser

Existing browser regression verifies that switching Central/Fuxing warehouses keeps the same browser navigation session and does not perform a full page reload.

### PASS — inventory search does not full-render on every keystroke

Inventory search uses DOM filtering and existing static regression blocks a return to `render()` on every search input event.

### PASS — unchanged inventory polls do not force a full render

The inventory cloud status path ignores the normal `synced` no-change status for full-page rendering.

### FIXED — unchanged business state was merged again on focus

Before this audit, returning focus to the browser caused:

`focus -> save() -> load() -> VPS fetch -> mergeBusinessModules() -> store listeners -> render`

even when the VPS business-state revision had not changed.

The sync layer now remembers the loaded revision per account/site and skips the merge when the authoritative VPS revision is unchanged.

Expected result: backgrounding the app and returning to it can still check freshness, but unchanged business data no longer rebuilds the UI tree unnecessarily.

### FIXED — bilingual DOM observer could react to its own patches

`ui-refresh.js` uses a `MutationObserver` plus animation-frame batching to apply bilingual/compact UI patches. The patch itself can add/remove text and label nodes.

The observer is now disconnected while its own DOM patch is being applied, pending self-generated mutation records are discarded, and observation resumes afterwards.

Expected result: a large application render should produce one bounded patch cycle instead of avoidable follow-up frames caused by the patcher's own mutations.

## P1 structural issue — whole application shell rendering

Current `src/app.js` still has a legacy architecture where:

- store updates subscribe to `renderWhenAuthorized`;
- `render()` replaces `#app` with a complete new `app-shell` using `root.innerHTML`.

This means many legitimate state changes can rebuild:

- sidebar
- topbar
- current page
- mobile navigation
- modal host

rather than updating only the affected page/component.

### Impact

This is the largest remaining source of potential frame stutter, especially when:

- inventory/business data grows;
- the current page contains long tables/lists;
- mobile CPU is slower;
- bilingual DOM patching and permission/access patching must process a newly rebuilt tree;
- a state change occurs while the user is scrolling or interacting with a control.

### Required follow-up architecture

Refactor in a separate controlled change set so business behavior does not change:

1. mount the persistent app shell once;
2. preserve sidebar/topbar/mobile navigation where their data is unchanged;
3. update only `page-content` for route changes;
4. update smaller page regions for local state changes where practical;
5. preserve focused controls and scroll position unless a business action explicitly requires movement;
6. keep existing permission, translation and VPS data rules;
7. run all inventory/account/business-state regression tests before deployment.

Do not mix this renderer refactor with new restaurant business features.

## Performance acceptance for the renderer refactor

At minimum verify:

- 1440x900 desktop;
- representative laptop width;
- 390x844 mobile-class viewport;
- 430px mobile width;
- phone landscape;
- route switching across all permitted modules;
- Central/Fuxing/Yongji switching;
- +/- and save operations in inventory;
- opening/closing product and account modals;
- background -> foreground return with unchanged VPS revision;
- bilingual Vietnamese/Traditional Chinese mode;
- no browser-level reload;
- no new console/page errors;
- no missing functions/permissions after partial-render refactor.

## Release classification

The two targeted regressions fixed in this audit are safe candidates for normal deployment after CI/browser regression.

The legacy whole-shell renderer remains documented technical debt and should be handled as the next dedicated performance phase. It must not be silently expanded by new code.
