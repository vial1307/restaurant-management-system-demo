# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #796 / run `35500763361`.
- Verified production SHA: `21d376295b6194e48bfaa599fc6c5424256a6196`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #929: PASS.
- Inventory Site Production Audit #54 / run `35500993290`: PASS.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item/location lifecycle and site-integrity hardening.
- Catalog sync removed from quantity/minimum authority.
- Minimum changes are transactional and visible in Inventory History.
- Receive-default create/update/delete are durably audited.
- No-op receive-default saves/deletes create no audit.
- Live GitHub & Handoff deployed.
- PR #130 / production #796 verified on schema 024.

## IN PROGRESS — inventory persistence and rapid-adjustment performance

Branch:

- `fix/inventory-roundtrip-performance-20260921`
- prerequisite catalog-audit PR #131 is merged; candidate base is `35ec19d3c89f43313a6d6895db446a6c7d5a5ea9`.

Schema:

- remains `024`.

Confirmed defects:

- branch/central rapid `+ / -` repeated whole-page renders and duplicate full inventory reloads;
- work-area changes were treated as catalog association edits instead of physical stock relocation;
- branch item edit submit referenced an undeclared `state` value and could fail before the API call;
- central modal quantity/minimum values were not sent to their authoritative stock endpoints;
- stocked storage changes in edit modals did not consistently use the relocation transaction.

Candidate behavior:

- coalesce rapid adjustments for 120 ms and send one net delta per quiet period;
- update only the active control while pending and reconcile exactly once from PostgreSQL after success;
- force authoritative reconciliation with visible error state after failure;
- add transactional `POST /api/inventory/relocate-work-area` with locks, transfer history and durable audit;
- use existing transactional storage relocation for stocked location replacements;
- persist modal quantity/minimum through dedicated endpoints, never catalog payloads;
- preserve catalog-manager vs stocktake capability boundaries;
- cover both 復興 and 永吉 in dynamic work-area relocation regression.

## NEXT

1. Keep PR #132 based on `main` after merged prerequisite #131.
2. Run PostgreSQL/API and concurrency regression in CI.
3. Verify work-area source/destination quantity, minimum, item metadata and audit for both branches.
4. Run desktop/mobile Chromium and full-device browser certification.
5. Merge only this exact tested head after every required check passes.
6. Deploy the exact merge commit and run Inventory Site Production Audit.
7. Continue auditing remaining inventory configuration mutations.

## BLOCKED

- No production data blocker.
- Local Docker is unavailable and Playwright browser download timed out; database/browser proof is pending CI.
- Production remains on #796 / `21d3762`; do not claim this candidate is deployed before deploy + smoke + audit pass.
