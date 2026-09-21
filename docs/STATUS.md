# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #815 / run `35549929164`.
- Verified production SHA: `09e2fffc80bf186d15054002c00421a2a5525e8f`.
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
- Production #815 verified on schema 024.

## IN PROGRESS — normalized-domain continuation

Branch:

- no open application candidate at this checkpoint;
- baseline is verified production `09e2fffc80bf186d15054002c00421a2a5525e8f`.

Schema:

- remains `024`.

The secure Admin/Data surface and VPS metrics are already production work. The next database stage must use the existing additive cutover discipline rather than create another writable authority.

## NEXT

1. Verify workforce schedule relational/compatibility parity on the current production release.
2. Prepare a separate reviewed change enabling `WORKFORCE_SCHEDULE_RELATIONAL_READ` with an immediate flag rollback path.
3. Keep compatibility schedule writes and module revision concurrency during the read-observation period.
4. After stable production evidence, select the next normalized business domain; do not retire compatibility data in the same step.

## BLOCKED

- No production data blocker.
- Production load/stress testing, deeper per-record business concurrency and literal physical-device certification remain approval/operational-setup items in `docs/PENDING_APPROVAL.md`.
