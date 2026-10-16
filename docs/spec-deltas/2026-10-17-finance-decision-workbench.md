# Finance OS decision workbench (2026-10-17)

Status: PR #252 UNDER TEST, NOT DEPLOYED. Depends on PR #250 dated liquidity alerts. Follow-up issue #251 recurring bills, linked repayments and automatic reminders.

## Purpose
A real date-ordered financial decision model that answers: when does salary arrive, which fixed obligations must be paid first, when is the minimum cash buffer breached, how much short-term cash would bridge the gap, when might full repayment become feasible, how should free cash flow fund debt/goals, and how much more income per payday is needed.

## Existing finance inputs
- Owner-only TWD wallet balances from posted finance ledger.
- Monthly expected cashflow items and exact entered due dates.
- Monthly debt fund allocations net of already posted debt payments.
- Monthly goals funding allocations and TWD outbound remittances.
- Recorded debt principal and annual rate only. Not an inferred true amortization schedule.
- Explicit warnings for foreign wallets/debts and missing FX data, missing debt funding periods, unknown/expired due dates.

## Implementation in PR #252
- Seven-tab UI adds "Bảng điều hành", with 3/6/12-month editable worksheet, monthly summary and per-date balance.
- Scenario-only rows: new income, major expense, extra debt payment, goal reserve, matched temporary borrow and repay.
- Every borrow requires an explicit repayment date and total cash repayment (including known fees). Never records the hypothetical borrowing as actual posted money.
- Read-only preview uses BigInt micro-TWD precision, reports first cash buffer gap, lowest balance, salary shortfall and safe extra debt principal capacity before next payday.
- If salary arrives after the critical bill, salary increase cannot repair the earlier deficit. Principal-only bridge window is a conditional lower bound; interest and fees are never invented.
- Optional goal target with total amount and deadline is distributed evenly over available future paydays in this version. Adaptive irregular savings allocation in expensive months remains pending.
- Workbooks are saved in isolated owner-scoped Finance Postgres migration 004, audited, with no changes to posted finance events, physical restaurant inventory or kitchen admin.
- Finance APIs are owner-only and protect writes with the finance write header.

## Still required
- Recurring salary and creditor calendar, real minimum payments, penalties, interest accrual, variable installment terms, paid-vs-expected reconciliation, automatically rescheduled goal/debt contributions when high-cost months appear, consented background notifications, cross-currency debt valuation at a confirmed rate.
- Do not present the 12-month projection as financially complete while these fields or obligations are missing.
- Release only with exact-head finance schema/API/regression, 320px/390px/1440px UI, Kitchen staging/full regression, postdeploy health, encrypted backup restore and private owner data acceptance.

Production must not be claimed for PR #252 until verified.