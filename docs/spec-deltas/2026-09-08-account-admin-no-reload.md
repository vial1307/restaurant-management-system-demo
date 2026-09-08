# SDD Delta — Account admin mutation reconciliation

Date: 2026-09-08
Base production: `dac795a0025b016be563e5deb300eb7a6cf721dc`
Priority: P1 interaction lifecycle / admin UX

## Problem

The VPS account editor already persists mutations to PostgreSQL, refreshes the cached account list, and emits `shitu:accounts-synced`. `account-admin.js` listens for that event and refreshes the Settings account UI. Despite that existing reconciliation path, `vps-auth-bridge.js` still performs a full `location.reload()` after both account save and account delete.

The reload is redundant for other-user mutations and causes a visible interruption on desktop/mobile. For self-admin edits it also hides a second concern: the mirrored local auth profile must be refreshed when the current administrator changes their own username/display name/password metadata.

## Required behavior

- Saving another account must persist to VPS/PostgreSQL, refresh the account list, close the modal, and update Settings without a page reload.
- Deleting/archiving another account must persist to VPS/PostgreSQL, refresh the account list, close the modal, and update Settings without a page reload.
- Saving the currently authenticated administrator must mirror the returned VPS user into the local auth profile and emit `shitu:auth-synced` before/alongside the existing account-list reconciliation.
- Keep the dedicated password-change logout/reload flow unchanged; this delta only removes reloads from admin account CRUD.
- Do not change backend authorization, account validation, session cookie semantics, permissions, inventory, business persistence, database schema, or routing.

## Acceptance

- Static contract proves admin save/delete blocks contain no `location.reload()`.
- Static contract proves current-user saves mirror `result.user` and emit `shitu:auth-synced`.
- Static contract proves the password-change flow remains the only `location.reload()` in `vps-auth-bridge.js`.
- Existing preflight, API/PostgreSQL concurrency, Chromium desktop/mobile, recovery/persistence, full-device cross-browser, exact-SHA production deploy, health/release, and production UI smoke remain mandatory.

## Rollback

Restore the two CRUD reload calls. No data migration or rollback is required.
