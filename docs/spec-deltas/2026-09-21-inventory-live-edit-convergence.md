# Inventory live edit convergence — 2026-09-21

## Problem

The inventory overview and product editor exposed overlapping fields but did not share one persistence contract. Some overview changes only affected browser state, per-location minimum edits were blocked by a legacy role-name guard despite an explicit edit grant, Central work/storage fields were read-only, and remote changes were discovered only by polling.

## Required behavior

1. `inventory.edit` plus allowed site scope authorizes every inventory control exposed as editable, including quantity and per-location minimum. View-only users remain read-only.
2. Work-area changes, storage relocation, quantity changes and minimum changes persist to PostgreSQL through their dedicated transactional APIs.
3. The overview and product editor reconcile from the same authoritative snapshot after every mutation; refresh must never restore a confirmed value.
4. Central, Fuxing, Yongji and future active sites follow the same contract.
5. Successful inventory writes publish an authenticated real-time invalidation signal. Other signed-in tabs/devices coalesce the signal and reload their active permitted site.
6. The originating tab avoids duplicate SSE refresh because its mutation path already performs one authoritative reconciliation.
7. Polling/focus/visibility remain fallback convergence mechanisms and unchanged snapshots do not trigger a visible rerender.

## Acceptance checks

- An employee or Central account granted `inventory.edit` can save quantity and per-location minimum within its allowed site.
- Changing work area or storage location in the overview is immediately reflected in the product editor and remains after F5.
- Changing the same fields in the product editor is immediately reflected in the overview and remains after F5.
- A second authenticated tab/device sees the committed result without waiting for the 60-second poll.
- Rapid `+ / −` remains coalesced and responsive.
- Every denied or failed database write is shown as failure and is reconciled back to server state.
