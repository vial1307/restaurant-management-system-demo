# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #823 / run `35571481421`.
- Verified production SHA: `30fd1ddff89cd821b5a66fe54ececca9f9e9825f`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #933: PASS.
- Deploy-integrated inventory site/data-integrity audit: PASS.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item/location lifecycle and site-integrity hardening.
- Catalog sync removed from quantity/minimum authority.
- Minimum changes are transactional and visible in Inventory History.
- Receive-default create/update/delete are durably audited.
- No-op receive-default saves/deletes create no audit.
- Live GitHub & Handoff deployed.
- Inventory catalog/work/storage/modal round-trip and rapid `+ / -` performance fix (PR #132) deployed.
- Inventory overview/editor writes persist with explicit `inventory.edit` + site scope and synchronize through authenticated SSE (PR #133).
- Central/Fuxing/Yongji two-tab database round-trip and peer-editor repaint regression: PASS.
- Production #823 verified on schema 024.
- Schedule Parity #105 / `35571899839` and Schedule Backfill verify #316 / `35571899835` both passed against exact release `30fd1dd`.

## IN PROGRESS — workforce schedule relational read cutover

Branch:

- `feat/workforce-schedule-relational-read-production-20260921`;
- baseline is verified production `30fd1ddff89cd821b5a66fe54ececca9f9e9825f`.

Schema:

- remains `024`.

The corrected verification queues are live. Schedule Parity and Schedule Backfill verify now both pass on the same deployed release, satisfying the cutover prerequisite. The candidate enables relational schedule reads in VPS Compose and runs the complete deploy regression job with the same authority enabled. Compatibility JSON writes and module revision concurrency remain active.

## NEXT

1. Require exact-head CI to pass with `WORKFORCE_SCHEDULE_RELATIONAL_READ=true` for the complete API/browser/PostgreSQL regression job.
2. Merge/deploy only that tested SHA and verify production release/schema/UI smoke.
3. Re-run Schedule Parity and Schedule Backfill verify against the deployed cutover release.
4. Keep compatibility schedule writes and module revision concurrency during the read-observation period.
5. Roll back immediately by setting `WORKFORCE_SCHEDULE_RELATIONAL_READ=false` in the VPS `.env` and recreating the app container if relational-read evidence diverges.
6. After stable production evidence, select the next normalized business domain; do not retire compatibility data in the same step.

## BLOCKED

- No production data blocker.
- Production load/stress testing, deeper per-record business concurrency and literal physical-device certification remain approval/operational-setup items in `docs/PENDING_APPROVAL.md`.
