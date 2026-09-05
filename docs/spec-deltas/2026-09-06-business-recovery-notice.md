# Spec delta — User-visible business recovery notice

Status: required behavior for the recovery-visibility phase following authorization-boundary hardening.
Parent specification: `docs/SYSTEM_SPECIFICATION.md`, sections 21-24.

## Problem

Authorization-boundary recovery now preserves unconfirmed dirty business modules in device-local drafts keyed by `userId + site`. The current application shell does not present that recovery state to the user. A recovery draft that exists but is invisible is operationally unsafe because the user may clear browser data, assume the edit was saved, or never tell a manager that manual review is required.

## Security constraints

The recovery notice is informational only. It must never re-expose business payloads that the current account may no longer be authorized to view.

The UI may display only recovery metadata:

- original site;
- changed top-level module names;
- capture timestamp;
- recovery reason/status.

The UI must not render, stringify, copy, download or otherwise expose the saved module payload in this phase.

Recovery drafts belonging to another user ID must never be listed for the current account, even on a shared device/browser profile.

## Required behavior

1. `business-state-sync` exposes a read-only helper that returns recovery metadata for one exact user ID.
2. The helper filters drafts by `draft.userId === currentUser.id` and does not return `draft.modules` payloads.
3. Every authenticated application route renders a global bilingual recovery notice when one or more drafts exist for the current user, regardless of which site the user is currently assigned to.
4. The notice survives page reload because it is derived from the durable recovery store rather than from an ephemeral event only.
5. The notice identifies the original site and changed module names so the user can report what needs review.
6. The notice must not contain a restore/apply action in this phase. Automatic or one-click replay across an authorization boundary is forbidden.
7. Switching to another authenticated user on the same browser hides drafts owned by the previous user.
8. No recovery notice is rendered when the current user has no drafts.

## Bilingual copy

Vietnamese mode should clearly communicate:

`Có dữ liệu chưa thể đồng bộ do quyền hoặc nơi làm việc đã thay đổi. Bản phục hồi đang được giữ trên thiết bị; không xóa dữ liệu trình duyệt trước khi quản lý xử lý.`

Traditional Chinese should communicate the equivalent operational meaning:

`因權限或工作據點已變更，仍有資料尚未同步。復原副本已保留在此裝置；管理者處理前請勿清除瀏覽器資料。`

Site/module metadata may be shown on a second line.

## Responsive requirements

The global notice must be usable at all mandatory breakpoints, including:

- <=359 px;
- 390 px phone;
- 412 px Android;
- phone landscape;
- tablet and desktop.

It must:

- not create horizontal document overflow;
- wrap long bilingual text;
- stay inside the main content width;
- not cover the topbar or mobile navigation;
- preserve tap/navigation usability on the rest of the page.

## Acceptance criteria

1. Seed one recovery draft owned by the signed-in admin for Fuxing/settings; the banner is visible on Desktop and Mobile.
2. The banner text identifies Fuxing and `settings`.
3. A unique marker stored only inside `draft.modules` is not present anywhere in rendered page text.
4. Reload the page; the banner remains visible.
5. Replace the recovery store with a draft owned by another user ID; the banner disappears for the signed-in admin.
6. At 390x844 the page has no horizontal overflow caused by the banner.
7. Existing route/permission, inventory, business-state sync and full-device regressions remain green.

No database schema, authorization policy, inventory behavior, or recovery-restore workflow changes in this phase.
