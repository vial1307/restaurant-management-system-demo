# GitHub & Handoff Live Sync Checklist — 2026-10-06 Audit

This document records the actual sync behavior observed in source before the Inventory redesign work begins.

## Current result

Status: **NEAR-LIVE / REFRESH-BASED, NOT CONTINUOUS REAL-TIME**

The current control plane is already database/GitHub authority aware, but it is not a continuously pushed real-time feed.

### One-link Handoff page

Current behavior:
- `handoff.html` reads `main`, `CURRENT_HANDOFF.md`, `STATUS.md`, open PRs and Actions from GitHub;
- `CURRENT_HANDOFF.md` explicitly controls ACTIVE_PR;
- raw handoff/status fetch uses `cache: "no-store"`;
- opening/reloading the page therefore requests fresh handoff text;
- the page does **not** currently run a periodic auto-refresh loop.

Conclusion:
- Fresh on page load/reload: YES.
- Continuous live update while page remains open: NO.

### Super Admin -> GitHub & Handoff

Current behavior:
- frontend loads `/api/admin/super/development-status`;
- Super Admin has a manual Refresh button;
- no dedicated periodic polling loop currently refreshes the Development panel while it stays open;
- backend `getLiveGitHubHandoff()` uses a 5-minute cache TTL;
- runtime release/schema are read from the serving VPS;
- GitHub production evidence is resolved against verified production SHA so docs-only main commits do not invalidate Deploy/Audit proof.

Conclusion:
- Correct authority model: YES.
- Fresh after manual refresh but may be up to 5 minutes behind GitHub because of backend cache: YES.
- Continuous real-time progress while page remains open: NO.

## Verification checklist

### Canonical authority
- [x] CURRENT_HANDOFF.md is authoritative.
- [x] ACTIVE_PR must be explicitly named in CURRENT_HANDOFF.md.
- [x] Open PRs do not automatically become the active workstream.
- [x] Runtime release/schema come from VPS.
- [x] Production workflow evidence is matched to verified production SHA.
- [x] Docs-only main commits do not invalidate production release evidence.

### One-link Handoff
- [x] Fetch current main.
- [x] Fetch CURRENT_HANDOFF.md.
- [x] Fetch STATUS.md.
- [x] Fetch open PR metadata.
- [x] Fetch GitHub Actions.
- [x] Use no-store for raw handoff/status content.
- [ ] Periodic auto-refresh while page remains open.
- [ ] Visible “last refreshed” countdown/state.
- [ ] Optional pause/resume auto-refresh.

### Super Admin -> GitHub & Handoff
- [x] Read live GitHub feed through backend.
- [x] Read VPS runtime release/schema.
- [x] Show verified production workflow evidence.
- [x] Manual refresh.
- [x] AgentMemory manual sync action exists.
- [ ] Development-only auto-refresh/polling.
- [ ] A force-refresh path that can bypass the 5-minute GitHub metadata cache for an authorized Super Admin request.
- [ ] Stale badge when GitHub metadata age exceeds threshold.
- [ ] Auto-refresh must not reset forms or other Super Admin sections.

### Worklog / docs
- [x] WORK_LOG is part of the mandatory handoff docs.
- [x] STATUS is part of the mandatory handoff docs.
- [x] DEVELOPMENT_RULES is linked.
- [x] Engineering Harness/Verification Matrix are linked.
- [ ] One-link page does not currently render WORK_LOG content inline; it links to WORK_LOG.
- [ ] Decide whether recent WORK_LOG entries should be rendered inline or kept link-only.

## Recommended follow-up for true near-real-time UX

Do this as a separate runtime PR, because it changes control-plane behavior and must pass the full engineering gate:

1. Add authorized `?force=1` handling to `/api/admin/super/development-status` and pass `force:true` to `getLiveGitHubHandoff`.
2. Poll only while Super Admin section `development` is visible, e.g. every 30–60 seconds.
3. Keep ordinary backend cache for other consumers to avoid GitHub API abuse.
4. Add age/stale indicator from `generated_at`.
5. Add 30–60 second auto-refresh to `handoff.html`, with no-store and an explicit last-refresh timestamp.
6. Never reload the full page; patch the Development panel so open forms elsewhere are untouched.
7. Regression:
   - ACTIVE_PR change appears without browser reload;
   - workflow status queued -> in_progress -> completed appears;
   - docs-only main commit still preserves verified production evidence;
   - GitHub outage falls back safely;
   - no API-rate-limit loop;
   - mobile/desktop handoff page remains usable.

Until that runtime PR is completed, the correct label is **“Live GitHub on load/manual refresh”**, not strict real-time.
