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
- Optional goal target with total amount and deadline is distributed evenly over available future paydays in this version. Adaptive savings distribution across available paydays is now implemented as an optional scenario mode; the bank-side funding action and creditor amortization remain pending.
- Workbooks are saved in isolated owner-scoped Finance Postgres migration 004, audited, with no changes to posted finance events, physical restaurant inventory or kitchen admin.
- Finance APIs are owner-only and protect writes with the finance write header.

## Still required
- Recurring salary and creditor calendar, real minimum payments, penalties, interest accrual, variable installment terms, paid-vs-expected reconciliation, automatically rescheduled goal/debt contributions when high-cost months appear, consented background notifications, cross-currency debt valuation at a confirmed rate.
- Do not present the 12-month projection as financially complete while these fields or obligations are missing.
- Release only with exact-head finance schema/API/regression, 320px/390px/1440px UI, Kitchen staging/full regression, postdeploy health, encrypted backup restore and private owner data acceptance.

Production must not be claimed for PR #252 until verified.
## Mô phỏng & Tư vấn: transparent cashflow decision philosophy (user-facing)

The page includes a collapsible, seven-rule explanation titled **Phương pháp tính & nguyên tắc tư vấn dòng tiền**. It must remain accessible on 320/390/1440 widths and distinguish implemented math from unimplemented optimizations:

1. **Source of truth:** owner-scoped posted TWD wallets only. Forecasted inflows/outflows/debt funds/goal funds/remittances are assumptions, not posted real money. Never double-count posted debt payments.
2. **Liquidity by date:** balance after each dated event; minimum balance and earliest date that breaks the user-selected reserve threshold. A paycheck credited later cannot pay a bill due earlier.
3. **Liquidity and obligations before optimization:** basic living expenses and legally due payments precede optional debt acceleration and goals. This is a decision *priority* but not an automatic bill classifier or due-date mutator.
4. **Debt acceleration:** caution on any 'safe extra debt' estimate, derived from a forecast trough before the next payday only and *not* safe if recurring bills or FX obligations are absent. The highest entered annual rate is a comparison hint, not a full amortization calculation.
5. **Borrowing bridge:** only paired positive borrow and scheduled repayment, with explicit repayment total including lender costs. A principal-only bridge window is informative and cannot be treated as proof of repayment affordability.
6. **Goal sinking fund:** target amount is spread equally over the recognized future hypothetical paydays before target date. The scenario engine now supports an adaptive (latest-available-payday first) allocator that preserves the cash reserve across known obligations, reports any unmet goal amount and feeds that gap into the reverse salary calculation. Its results are conditional on complete source schedules.
7. **Change propagation:** update worksheet cells then re-run preview, comparing new dated risk. Changes to underlying Finance planning/debts outside the worksheet require a fresh data read. No true real-time cross-tab invalidation and no push/email monitoring yet.

Documentation is explanatory UI only; adding this note does not activate an optimizer, notifications, automatic loan, debt refinancing, or persistent recurring bills. Never imply production release prior to exact-head CI and gated deployment.

## Approved UI implementation (2026-10-17)

- Finance Plan: pale four-metric row, spreadsheet-like dated receipts/outflows and debt/goal funds; edit/delete controls, 30/60/90-day liquidity graph, interactive warnings and advice, three-month financial plan from finance PostgreSQL and goal progress.
- Reports: annual actual-income/expense and signed monthly delta line, spending by real expense category, category budget variance, actual TWD transaction history, month search, CSV export and browser PDF print.
- Visuals are pure SVG/CSS, generated from the authenticated Finance API. No fixed balance examples, sample exchange rates or local-storage shadows.
- Responsive strategy: one DOM for 1440px, 390px, 320px; mobile horizontal worksheet scroll and horizontal bottom navigation. Print CSS hides controls and exposes reports.
- What-if engine now has income shortfall as negative income (not wrongly counted as consumption) and goal.mode = 'even' or 'adaptive'. 'adaptive' optimizes timing *only among disclosed future payday dates*; allocations are not automatic transfers and do not alter any creditor schedule or real outstanding balance.
- Action Center uses dated earliest-risk, bridge window, hypothetical loans, adaptive goals, extra debt-payment trial and direct links to edit actual plans. It is not an automated refinancing broker.
- Tests: analytics UI and semantic browser controls, adaptive high-cost month funding and unmet goal warning, DB owner-only source, private login, debt payment immutability and Kitchen regression gates.
