# Action feedback and successful popup close — 2026-09-10

## Intent

Interactive writes must tell the operator whether the action actually succeeded. A success popup/notification must not remain on screen indefinitely, and editable dialogs should close after a confirmed successful write when they are still open.

## Contract

- A user-initiated write is tracked only for a short bounded window.
- Business-state actions resolve only from `shitu:business-persistence-status` with `status=saved` for the same module.
- Inventory actions resolve only from `shitu:inventory-cloud-status` with `status=synced` while a user action is pending; background inventory polling alone must not create toasts.
- Account changes resolve only after `shitu:accounts-synced`.
- Success feedback auto-dismisses after a short interval and is manually dismissible.
- Error feedback stays visible longer and does not close the editable popup.
- When a successful tracked action still has an open modal, the normal close control is invoked first so application state stays synchronized; direct DOM removal is only a fallback.
- Desktop and mobile use the same runtime and the same feedback behavior.

## Non-goals

- Do not turn background synchronization into user-visible success spam.
- Do not change PostgreSQL write semantics, permissions, inventory quantities, or business concurrency rules.
- Do not introduce deeper per-record/realtime concurrency.
