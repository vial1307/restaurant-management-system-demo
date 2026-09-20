# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #802 / run `35526347373`.
- Verified production SHA: `9bc9ad5f3571e197070a9430ff9e4c7bc3123f6a`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #931: PASS.
- Inventory Site Production Audit #61 / run `35526617408`: PASS.
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
- Production #802 verified on schema 024.

## IN PROGRESS — inventory overview/editor real-time convergence

Branch:

- `fix/inventory-live-editor-sync-20260921`
- candidate base is verified production `9bc9ad5f3571e197070a9430ff9e4c7bc3123f6a`.

Schema:

- remains `024`.

Confirmed defects:

- legacy role-name guards blocked quantity/minimum despite explicit `inventory.edit`;
- Central overview work area/storage location were not editable or linked to the editor;
- branch overview scalar changes rendered optimistic local state before database confirmation;
- inventory realtime subscription was empty, leaving tabs/devices on 60-second polling.

Candidate behavior:

- explicit `inventory.edit` plus site scope authorizes every exposed inventory edit; view-only and foreign-site accounts remain denied;
- Central overview selectors use catalog sync and transactional relocation, then refresh overview/editor from PostgreSQL;
- branch overview quantity/minimum perform no browser-only success and reconcile exactly once;
- authenticated SSE invalidates other tabs/devices in real time, with self-event suppression and coalescing;
- polling/focus/visibility remain fallback paths;
- dynamic API regression covers employee/central edit grants, view-only rejection and SSE delivery.

## NEXT

1. Push the candidate and open its PR from the exact local commit.
2. Run PostgreSQL/API, SSE and concurrency regression in CI.
3. Run desktop/mobile Chromium and full-device browser certification.
4. Merge only the exact tested head after every required check passes.
5. Deploy the exact merge commit and run Inventory Site Production Audit.

## BLOCKED

- No production data blocker.
- Local Docker is unavailable and Playwright browser download timed out; database/browser proof is pending CI.
- Production remains on #802 / `9bc9ad5`; do not claim this candidate is deployed before deploy + smoke + audit pass.
