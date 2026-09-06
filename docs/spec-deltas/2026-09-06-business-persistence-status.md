# Spec delta — Visible business persistence status

Status: required behavior for the business persistence observability phase.
Parent specification: `docs/SYSTEM_SPECIFICATION.md`, especially sections 21-24.

## Problem

Non-inventory business modules autosave to VPS/PostgreSQL. The synchronization layer already emits `shitu:business-state-status` events for save success and failures, but normal application UI does not present those failures to the signed-in user. A failed autosave can therefore be technically safe (stale reload is blocked) while still being operationally ambiguous: the user may assume the edit reached PostgreSQL when it did not.

This violates the existing contract that failed VPS writes must surface as failure and must not be presented as successful local saves.

## Scope

This phase adds user-visible persistence status for non-inventory business-state writes only.

It does not change:

- database schema;
- inventory write semantics;
- account authorization;
- recovery draft restore/apply behavior;
- business-state conflict/concurrency model;
- whole-app render architecture.

## Required synchronization signals

For a real dirty business-state write attempt, the synchronization layer must emit enough information for the UI to distinguish:

1. `pending` — a local business edit exists and is waiting for its debounced VPS persistence attempt;
2. `saving` — a dirty-module POST to VPS has started;
3. `saved` — every dirty module in that attempt was explicitly confirmed by VPS;
4. `error` — persistence could not be confirmed.

Routine reads (`ready`) and recovery metadata (`recovery-pending`) are not save-success signals.

A no-op snapshot that has no dirty modules must not create a false `saving` or `saved` message.

## User/site scoping

Persistence status must be scoped to the exact current authenticated user and business site.

Each write lifecycle event used by the visible status layer must carry:

- `userId`;
- `site`;
- `status`;
- changed top-level module names when relevant.

A status generated for a previous user/site must not remain visible after account or site identity changes.

## Error behavior

Persistence errors must remain visibly actionable until one of these happens:

- the same current `userId + site` later receives a confirmed `saved` event for a business write; or
- the authenticated identity/site changes, in which case the old scoped status is removed from the current UI.

A later `ready`/read event must not clear a write error by itself.

Examples that must be represented as failure rather than success include:

- offline (`BUSINESS_STATE_OFFLINE`);
- VPS/auth not ready (`BUSINESS_STATE_NOT_READY`);
- request timeout/unreachable API;
- partial `savedModules` confirmation (`BUSINESS_STATE_PARTIAL_SAVE`);
- missing production save confirmation;
- authorization/site errors returned by the backend.

The UI should translate known error classes into concise bilingual operational language. Raw payloads, stack traces, credentials or sensitive recovery data must never be rendered.

## Visible UI contract

The application must expose a compact global persistence indicator/notice for the current authenticated scope.

Required behavior:

- `pending`: show that changes have not yet been confirmed by VPS;
- `saving`: show that changes are currently being saved;
- `error`: show a persistent warning that changes are not confirmed in PostgreSQL and should not be assumed saved;
- `saved`: show a short confirmed-success state, then it may disappear automatically;
- `ready` alone must not be shown as a save success.

The notice must not cover navigation, modals or primary controls.

The existing durable authorization-recovery banner remains separate and higher priority. A persistence-status notice must not hide or replace a recovery notice.

## Bilingual meaning

Vietnamese examples:

- pending: `Có thay đổi chưa được xác nhận trên VPS.`
- saving: `Đang lưu thay đổi lên VPS…`
- saved: `Đã lưu thay đổi vào VPS.`
- error: `Chưa lưu được thay đổi vào VPS. Dữ liệu này chưa được xác nhận trên PostgreSQL.`

Traditional Chinese equivalents should communicate:

- pending: `有變更尚未由 VPS 確認。`
- saving: `正在將變更儲存至 VPS…`
- saved: `變更已儲存至 VPS。`
- error: `變更尚未成功儲存至 VPS；PostgreSQL 尚未確認此資料。`

## Responsive/accessibility requirements

The persistence notice must:

- work at 320, 359, 390, 412 px and phone landscape;
- not create horizontal document overflow;
- use `role="status"` for pending/saving/saved and `role="alert"` for error;
- update without stealing focus;
- remain readable in Vietnamese and Traditional Chinese;
- avoid permanent animation or flashing.

## Acceptance criteria

1. After initial VPS load, mutate one editable business setting and notify the store subscriber; before the debounce fires, a scoped `pending` event exists.
2. When the dirty POST starts, a scoped `saving` event exists.
3. A fully confirmed VPS response emits scoped `saved` with the changed module list.
4. A failed save emits scoped `error`; a subsequent `ready` read event does not clear the error UI.
5. A later confirmed save for the same user/site clears the failure and shows confirmed success.
6. Switching authenticated user/site hides status from the previous scope.
7. A no-op focus refresh with no dirty modules never reports `saving`/`saved`.
8. Real Chromium UI regression verifies pending/saving/error/saved states and no horizontal overflow at mandatory phone breakpoints.
9. Existing recovery notice, account/permission, inventory, synchronization and full-device regressions remain green.
10. Production smoke verifies the deployed persistence notice assets and a synthetic local status event without writing production business data.
