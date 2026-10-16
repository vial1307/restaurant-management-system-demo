# Personal Finance OS — private finance database specification (2026-10-16)

Status: **DESIGN + DATABASE FOUNDATION**; production enablement requires separately approved VPS rollout.

## Purpose and independence
Add a private personal-finance module to the **existing Kitchen OS VPS** for monthly/yearly budgets, cash-flow forecasting, repayment schedules, currency conversion, and transfers/remittances, without reusing any restaurant inventory, payroll, procurement, or restaurant business-state tables.

- Runtime: authenticated browser -> same-origin VPS API -> **separate PostgreSQL database**, not Supabase/localStorage/GitHub Pages.
- Dedicated Postgres container/volume + dedicated login and password. The restaurant database does **not** gain foreign tables or foreign keys to finance.
- Require both an existing authenticated kitchen session and an explicit owner allow-list env `FINANCE_OWNER_USER_ID` (UUID). Being restaurant admin alone is **not** sufficient. No owner configured => deny all finance reads and writes.
- Permission check on **every** endpoint; never expose finance row contents in Super Admin's generic DB snapshots, logs, handoff, public status or audit feed.
- Production migration must be opt-in, backed up and individually verified. Must not block the existing Kitchen OS deployment if finance has not been provisioned.
- Currency ISO codes: TWD, VND, USD, JPY, EUR, CNY initially; catalog extensible in DB, do not hard-code supported currencies in UI.
- Currency decimals and exchange rates: `numeric` in PostgreSQL; never use JS floating-point numbers for ledger arithmetic, use decimal strings or a proven decimal library.
- Financial account balances are derived from **posted entries**, never an independently mutable cached balance. Transfers between one's own accounts, FX exchanges and remittances **must not** be counted as consumption expenditure.
- Separate **planned** FX/remittances from **posted actual** transactions. Exchange quotes are informational only and must not be called real-time without verified source/timestamp.
- Every completed money movement must use atomic SQL transaction, owner/account checks, idempotency keys and an audit row. Prefer immutable postings and explicit correction/reversal rather than deletion.
- Never implement real money movement or bank integration from a planning click: finance module records only; actual execution requires a separately reviewed payment integration.

## Modules / user navigation
1. Tổng quan: balance per account/currency, total assets converted to chosen reporting currency, *as-of* exchange rate; distinguish assets, liabilities, income, spending and free-to-spend.
2. Kế hoạch tháng/năm: category budgeting, projected income, expenses, debt repayment, tuition sinking fund, fixed obligations; planned vs actual and month/year comparison.
3. Ngoại tệ: six currencies (extensible), quote snapshot, calculate estimated proceeds and fees, planned monthly TWD -> VND remittances and other pairs, history.
4. Ví & tài khoản: bank/cash/e-wallet ledgers, owned beneficiary vs external remittance recipient, reconciliation; never treat an internal transfer as expense.
5. Nợ & mục tiêu: liabilities, repayment schedule, goals, forecasts under different salary/FX scenarios.
6. Báo cáo: cash flow, budget variance, net worth, multimonth projection, export, revision history.

## Database logical model
- `finance.currencies`: ISO code, display decimals.
- `finance.accounts`: personal cash/bank/e-wallet balances derived from ledger, currency-specific.
- `finance.categories`: expense/income categories.
- `finance.events`: posted financial events (income, expense, transfer, fx, remittance, adjustment); unique idempotency request per owner.
- `finance.entries`: signed per-account movements (positive = money received, negative = money left), category optional; snapshot `base_amount_twd` for spend/income reporting.
- `finance.fx_exchanges`: one immutable conversion record per posted FX event, rate/fee snapshot.
- `finance.fx_rates`: time-stamped indicative or manually captured rates, with source.
- `finance.fx_plans`: planned future conversions/remittances (no postings until explicitly confirmed).
- `finance.monthly_budgets`: monthly allocation by category in reporting currency; compare against categorized posted entries only.
- `finance.goals`, `finance.debts`, `finance.debt_payments`: goal and liability projections without conflating principal with consumer expense.
- `finance.audit_events`: actor, operation, entity id, timestamp and sanitized metadata.

### Example
Plan converting NT$10,000 into VND next pay cycle: create `fx_plans` with pair TWD/VND, expected FX rate, estimated fee and date. **No account balance changes**.
When actual funds are converted, post `events(kind=fx)` and multiple `entries` in one SQL transaction: TWD debit, VND credit and source account fee debit (if any), with immutable effective FX snapshot. Resulting balance uses posted entries only. If money was sent to someone else rather than your own VND account, record `remittance` as an external transfer, not a fake VND wallet credit.

## Security & deployment acceptance
- [ ] DB/role/volume truly separate and existing Kitchen DB remains untouched.
- [ ] No finance owner env configured -> 503 unavailable; authenticated non-owner -> 403; anonymous -> 401.
- [ ] Create/read/update operations cannot cross owner/account boundaries, including using guessed IDs.
- [ ] Finance migration can be applied twice safely and fails on invalid financial entries.
- [ ] No posting duplicated on client retry; partial conversion rolls back atomically.
- [ ] Month budget ignores own-account transfers and FX exchanges.
- [ ] Financial summaries show as-of FX rates and missing-rate warning, never fictitious amounts.
- [ ] Desktop/mobile, TWD/VND/USD/JPY/EUR/CNY selection, TWD->VND monthly plans all work.
- [ ] Dedicated encrypted backup, private backup retention, restore test, and production smoke test before marking DONE.

## Release stages
- **Stage 1**: isolated schema, opt-in compose file, migration runner, documentation and schema verification.
- **Stage 2**: owner-only API, audit/idempotency, functional responsive UI with real persistent read/write.
- **Stage 3**: forecasts, reminders, CSV/PDF exports, rate-provider integration and end-to-end deployment checks.

Until stages 2/3 pass, the mobile concept is a design only; no UI button should falsely claim a server save.