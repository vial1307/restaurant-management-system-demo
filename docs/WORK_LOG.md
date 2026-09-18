# Kitchen OS Work Log

This file is the canonical continuation log for implementation, CI, merge and deployment work. Do not record credentials, secret values or private keys here.

## 2026-09-18 — Inventory site authority + PostgreSQL storage relocation

### Scope
- Fixed cross-site inventory switching so 央廚 / 復興 / 永吉 do not render stale inventory from the previous site.
- Fixed storage-location changes so 大冷凍 -> 4門冰箱 / 廚房冰箱 / 大冷藏 is a real PostgreSQL inventory relocation instead of a local/catalog-only edit.
- Added canonical continuation document: `docs/CURRENT_HANDOFF.md`.

### Cross-site synchronization fixes
- Interactive warehouse switching now hydrates the target site before emitting the active-site-changed event.
- Late sync responses from an inactive branch can no longer overwrite the currently active branch record.
- Interactive site switching bypasses short-lived inventory/master-data caches and forces a fresh VPS snapshot.
- Failed target-site hydration rolls back the site preference instead of showing a new site with old data.
- Production workflow #682 verified real site transitions and production smoke.
- Runtime force-refresh fix passed full-device cross-browser regression and production deployment in workflow #690, commit `483833a95f95822fa32e275579b3890f34c27598`.

### Storage relocation
- Added `POST /api/inventory/relocate-storage`.
- Relocation is one PostgreSQL transaction:
  - lock source/destination stock rows;
  - merge source quantity into destination;
  - preserve minimum safely by using the greater destination/source minimum;
  - remove the old source stock association;
  - move fixed receive-default when it pointed to the old location;
  - write inventory transaction when quantity moves;
  - always write `inventory_storage_relocate` audit log.
- Branch storage dropdown now calls the relocation API and does not optimistically mutate local state.
- Added regression proving source row removal, destination quantity/minimum and receive-default movement.
- Existing stocktake permission boundary remains intact.

### CI / deployment state at handoff
- #690 / `483833a95f95822fa32e275579b3890f34c27598`: SUCCESS, deployed to production, production UI smoke PASS.
- #691 / `d15ae2087d293111b989b5e5efe7d56ac3bebb84`: running when the handoff documentation was created; this commit adds an additional static guard for forced VPS hydration and does not change the already deployed runtime behavior from #690.
- Do not claim a newer production SHA until deploy + production smoke are green.

### Next continuation point
1. Confirm newest production workflow and live SHA.
2. Begin secure database redesign/data-admin work behind the VPS API; no browser-direct PostgreSQL.
3. Keep `docs/CURRENT_HANDOFF.md` and this work log updated with every significant fix/deploy.
4. Add Super Admin VPS metrics: disk, RAM, CPU/load, uptime, PostgreSQL size/connections, backup footprint, deployed SHA/schema and safe network/bandwidth counters.
5. Preserve all inventory invariants and release gates documented in `docs/CURRENT_HANDOFF.md`.

## 2026-09-13 — Workforce leave / shift-change workflow

### Scope
- Pull request: #80 `Add workforce leave and shift-change requests`
- Feature branch head tested before merge: `0a3065bf064cb110cbab11a538abcb2dfa4253ca`
- Squash merge commit on `main`: `69fcc350dd8f9cb645177eb571ecef956479d34d`
- Storage remains in the existing PostgreSQL `business_state.modules.schedule` JSONB document; this phase requires no SQL migration.

### CI diagnosis and resolution
- The original PR workflow failure was isolated to the existing `Full-device cross-browser regression` gate, not the new workforce API/browser request tests.
- The captured full-device artifact showed all scoped mobile role/site Chromium cases passing; the one failure was a timeout while certifying the administrator mobile navigation state.
- No permission assertion or release gate was weakened. The exact failed regression job was rerun unchanged.
- Rerun result: preflight and regression passed, including workforce approval/request coverage, mobile role/site certification and full-device cross-browser coverage.
- PR #80 was merged only after the unchanged release gates were green.

### Production pipeline
- Main deployment workflow run: `34715840529` for exact application commit `69fcc350dd8f9cb645177eb571ecef956479d34d`.
- Isolated API load-smoke run: `34715840533` — passed 10/25/50-client smoke.
- Production result verified: preflight, regression, exact-SHA VPS deploy, health/release check and `production-ui-smoke` all completed successfully.
- Production deploy job used the existing server-side backup/rollback path before releasing the exact tested commit.

### Database safety
- No schema/data migration is introduced by PR #80.
- Before the next schema/data migration, preserve one immutable original PostgreSQL baseline dump outside normal rotating backups. Do not claim this baseline exists until it has been verified on the VPS.

### Next continuation point
1. Build attendance correction/request workflow as the next workforce slice; employee/part-time submit their own correction request, manager/admin approve or reject, and approved correction invalidates attendance approval so it must be reviewed again.
2. Then continue payroll history/export and configurable scheduling/shift rules without inventing wage rules.
3. Keep manager/admin authority distinct from employee/part-time self-service and certify desktop/mobile parity through the existing release gates.
