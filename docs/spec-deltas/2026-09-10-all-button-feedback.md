# Universal button feedback — 2026-09-10

## Intent

Every enabled button-like control in the application must give the operator visible feedback when pressed. Confirmed write actions must keep their existing VPS-backed success/error feedback instead of being replaced by an optimistic UI-only success message.

## Contract

- The shared runtime covers native `button`, `[role="button"]`, `input[type="button"]`, `input[type="submit"]`, and `input[type="reset"]` controls, including dynamically rendered controls.
- Disabled controls do not emit feedback.
- Existing confirmed write controls continue to resolve from the established VPS business, inventory, or account synchronization signals.
- Non-write UI controls emit a short bilingual interaction notification immediately after the click.
- The generic interaction notification is pointer-transparent so it cannot block subsequent taps/clicks on desktop or mobile.
- The generic interaction notification replaces the previous generic interaction notification instead of stacking repeated UI clicks.
- Result toasts themselves are excluded from universal button feedback so dismissing a toast cannot create another toast.
- `index.html` and `vps-entry.html` load the same release-stamped runtime.

## Non-goals

- Do not change PostgreSQL data, permissions, inventory quantities, business concurrency, or API semantics.
- Do not convert navigation links that are not button-like controls into notifications.
- Do not weaken existing confirmed-write result semantics.
