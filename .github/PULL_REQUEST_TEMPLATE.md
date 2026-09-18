## Context

- [ ] I read `docs/CURRENT_HANDOFF.md`.
- [ ] I read `docs/STATUS.md` and the relevant specification/database docs.
- [ ] I identified the current verified production SHA before changing runtime code.

## Change

Describe the problem, affected modules, invariants that must remain true, and the exact stopping point if this PR is not complete.

## Database / persistence

- [ ] No new browser/localStorage business authority was introduced.
- [ ] PostgreSQL remains reachable only through the VPS API.
- [ ] Any schema change uses a new numbered migration; deployed migrations were not edited.
- [ ] Backfill/cutover is restartable and does not create dual writable authorities.
- [ ] Multi-row mutations are transactional and concurrency behavior is defined.

## Security / authorization

- [ ] Backend authorization is enforced independently of frontend visibility.
- [ ] Generic admin writes use explicit table/column allowlists and validation.
- [ ] Sensitive host/database internals or secrets are not returned to the browser.
- [ ] Mutations that change business data remain auditable.

## Verification

List static, API, database, browser, device and production checks run. Include workflow/run IDs when available.

## Handoff

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/WORK_LOG.md` updated.
- [ ] `docs/CURRENT_HANDOFF.md` updated if production state or continuation point changed.
- [ ] Production SHA is recorded only after deploy + smoke are green.
