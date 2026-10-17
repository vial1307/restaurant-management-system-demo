# Finance OS — AI Financial Mentor (On-demand chat)
**Date:** 2026-10-18  
**Status:** DESIGN / AUDIT ONLY — no AI service, credential or production deployment activated.  
**Source baseline audited:** `main` @ `bdfedcc9099f0f5c7b77d85eaeb40be197236490`.  
**Website:** https://finance.82.47.180.185.nip.io/  
**Scope:** private Finance OS only; no Kitchen business data, no changes to posted ledger, no autonomous transfers. User-initiated AI analysis plus optional **deterministic** scheduled reminders with explicit consent, not background AI inference.

## 1. Verified repository audit (not live private data acceptance)

| Component | Source evidence | Decision |
|---|---|---|
| Dedicated Finance UI | `finance.html`, `src/personal-finance.js`, `src/personal-finance.css` | Add an `AI Mentor` tab to existing single DOM/responsive navigation |
| Fastify API | `vps/backend/src/server.mjs` and `finance-routes.mjs` | Register an independently testable AI route under `/api/finance/mentor/*` |
| Finance owner authorization | `finance-routes.mjs:authorized` and `FINANCE_OWNER_USER_ID` | Reuse EXACT owner/same-origin session gate; never admit another Kitchen admin |
| Isolated DB | `finance-db.mjs`, `vps/docker-compose.finance.yml` | Read only from private `finance` schema / separate `kitchen-finance-db` volume |
| Deterministic liquidity math | `finance-advisor-engine.mjs` | Reuse micro-TWD BigInt engine; model must never recompute figures by intuition |
| Advisor source data | `finance-advisor-routes.mjs` | Centralize shared owner-scoped snapshot loading (no duplicated SQL logic) |
| Scenario engine | `finance-scenario-engine.mjs` and `finance-scenario-routes.mjs` | Tool-enabled what-if via existing pure preview only, not ledger mutation |
| Browser owner access | `docs/CURRENT_HANDOFF.md` | Prior CI/public live smoke documented; **authenticated owner's live real-data check still required** |
| HTTPS / path isolation | `vps/Caddyfile` | Existing `/api/finance/*` covered; do not expose `/src/*` broad allowlist |

**Coordination blocker:** PRs #260, #261 and #262 are simultaneously open and modify Finance debt/goal planning; several propose Finance migration 006. Do not edit or ship debt/goal contracts, migrate AI tables as 006, or rebase a live AI implementation until one canonical workstream is selected/merged. The AI design branch is deliberately independent and documentation-only.

**Unavailable during audit:** private VPS environment values, OpenAI API credential, owner-authenticated PostgreSQL reads, browser runtime on the production Finance hostname. DNS from the current execution environment did not resolve the Finance hostname; this is **not evidence of a website outage**.

## 2. Functional contract

User initiates each analysis via an explicit chat message or one of the suggested questions:
- “Từ nay đến kỳ lương tiếp theo, ngày nào thiếu tiền và thiếu bao nhiêu?”
- “Nếu tôi tăng thu nhập 8,000 TWD kỳ lương tới, nên trả khoản nợ nào?”
- “So sánh trả nợ A trước và giữ quỹ dự phòng trước.”
- “Nếu thu nhập giảm 20%, mục tiêu tiết kiệm phải dời đến khi nào?”
- “Dòng tiền VND/TWD tháng sau thiếu dữ liệu tỷ giá nào?”

### UI specification
- New `AI Mentor` tab after `Mô phỏng & tư vấn`, responsive on 320/390/1440px.
- Conversation feed, multiline input, “Phân tích” button; no silent automatic request when visiting the page.
- Context controls: horizon `30/60/90/365 ngày`, TWD cash reserve, optionally focused scenario; default from existing Finance settings.
- Every reply has: **Kết luận** → **Bằng chứng/số liệu** → **Rủi ro & thiếu dữ liệu** → **Phương án so sánh** → **Hành động được đề nghị**.
- Grounded figures display currency, as-of date (Asia/Taipei), source kind (`ledger posted`, `planned`, `hypothetical`) and any assumed/estimated dates.
- A small “Xem phép tính” expansion references advisor entry IDs/dates and scenario calculations so an owner can reconcile with Kế hoạch or Công nợ & mục tiêu.
- Explicit “Đây là mô phỏng — không ghi giao dịch thật”. AI never submits a plan/payment or modifies data.
- If API is unconfigured, clearly show `AI_MENTOR_NOT_CONFIGURED` while other Finance pages function normally.
- Never render AI Markdown as unsanitized HTML; escape all content (avoid XSS and prompt-injection instructions originating in debt notes).

## 3. Backend architecture & data contracts

```text
Finance UI → POST /api/finance/mentor/messages (same-origin cookie + X-Finance-Write: 1)
           → authorized(request,reply,{write:true}) + rate/body budget
           → owner-scoped Finance Snapshot Service (PostgreSQL read-only)
                  ↳ ledger wallet balances and posted events
                  ↳ date-specific income/expense plan and debt/goal allocations
                  ↳ debt outstanding, APR/due dates, incomplete FX warnings
                  ↳ calculateFinanceAdvice / scenario preview (BigInt engine)
           → safe compact structured facts (not raw SQL, passwords or full account identifiers)
           → OpenAI Responses API (server-side OPENAI_API_KEY, store:false)
           → structured explanation and clearly separated assumptions
           → response to Finance UI (read-only)
```

Suggested API, not yet implemented:
- `POST /api/finance/mentor/messages` body `{conversationId?,message,horizonDays,bufferTwd,scenarioId?}`. Each send loads a **fresh** server snapshot. Owner-only; bounded input, timeout and per-owner spend/rate caps. The client never supplies trusted balance, debt or tool outputs.
- `GET /api/finance/mentor/conversations`, `GET /api/finance/mentor/conversations/:id`, `DELETE /api/finance/mentor/conversations/:id` only if user-controlled history persistence is enabled. Storage lives in `finance` schema, not Kitchen, never public localStorage.
- AI tool contract must be allowlisted and readonly: `get_liquidity_projection(days,buffer)`, `get_debt_goal_snapshot()`, `preview_scenario(scenario)`, `explain_transaction_sources(ids)`. Each tool authorizes the current owner and validates arguments. **No LLM-generated SQL** and no ledger write tools.
- Do not assume `GET /advisor` is safe to call internally over HTTP with copied cookies; refactor the snapshot/query into a single importable service and reuse it from current advisor and mentor routes.
- Response envelope should include `answer`, `asOf`, `sourceRevision`, `warnings`, `calculationIds`, `model`, `usage`, and `simulationOnly:true`. No API key or raw DB secrets in response.
- Run `store:false` for Responses API and persist conversation to Finance database only when user has opted into in-app history. Configure model, API timeout, response token limit, rate cap and spending budget through server env. ChatGPT Plus subscription is independent of API billing.

## 4. Rules that must not be weakened

1. Source of truth is posted owner-only ledger for spendable current TWD; expected cashflow and debt funds are future **planned** events, not live wallet money. Never count a plan as already received.
2. Keep foreign wallet value out of immediately spendable TWD unless an actual user-owned conversion has been posted. Reference FX rate is not proof of TWD liquidity. Surface missing/stale FX explicitly.
3. Net posted debt payments against allocations; never double-count. Distinguish debt principal from interest, fees, partial settlements, and user-entered minimum payments.
4. Date ordering matters: salary paid on 10th cannot retroactively cover due dates on 8th. Show first breach and gap against buffer.
5. Prioritize *mandatory essential expenses and contractual due payments* above elective prepayment and savings, even if the label shortcut says `Nợ > Chi > Tiết kiệm`.
6. A forecast cannot claim a full repayment plan is guaranteed while recurrence, penalty, bank settlement, minimum due, due-date or FX details are absent. Demand the missing fields and show conditional advice.
7. A mentor recommendation has no write privileges. An optional future “Apply suggestion” feature would require a separate explicit owner-reviewed edit screen and standard audited write endpoint; out of scope now.
8. No automatic outbound notifications, no background polling, no hidden API calls on page load. Each analysis is user-initiated.

## 5. Security and observability requirements

- Reuse exact `FINANCE_OWNER_USER_ID` authorization and host-only Finance session; session cannot cross the Kitchen finance boundary.
- Require anti-CSRF finance header for chat POST; require JSON content type and validate message length (suggest ≤2000 characters), max prior turns, scenario/horizon/buffer allowlist. Reject external-provided tool output as authoritative.
- Apply server-side request concurrency, timeout, retry ceiling, monthly hard API-cost budget and model allowlist. Fail closed on no API key or exceeded budget.
- Store `OPENAI_API_KEY` in root-protected VPS env/secret store, never in GitHub or browser bundle; scrub PII/sensitive notes before outbound context where possible.
- Log request id, duration, model, token usage and error class; never log full message, bank balance, raw prompt or upstream API key.
- Use developer-owned grounded tool results; treat finance item descriptions and the user prompt as untrusted content that cannot override the system/tool policy.
- Data processing, optional chat retention/deletion and any upstream data retention should be made visible to the user. Avoid claiming zero retention where provider policies differ.

## 6. Release plan, prerequisites and acceptance gates

**Phase A — current design PR:** documentation only. No runtime code, no DB migration, no production deployment.

**Phase B — backend PR after finance-core PR consolidation:** extract shared finance snapshot; implement authenticated read-only chat endpoint and OpenAI adapter behind `FINANCE_AI_ENABLED=false` default; unit tests with mocked OpenAI responses. Add optional Finance-only conversation/history migration using next available number **after** debt/goal migration settles.

**Phase C — frontend PR:** add responsive AI Mentor tab; render source/assumption cards, errors and loading, follow-up chat, accessibility. Verify 320/390/1440 layouts.

**Phase D — secure activation:** set a privately generated OpenAI API key on VPS only; choose model and monthly budget; enable flag. Run owner-only readback and smoke tests without exposing private balances in logs.

**Phase E — optional deterministic reminders:** add a consented and auditable scheduler + notification delivery only after the new debt terms and due-date model are stable. The scheduler performs no unsolicited OpenAI call. Disable by default. Test de-duplication, timezone and due-date edits.

**Required pass criteria:**
- anonymous `401`; unrelated Kitchen admin `403`; owner authenticated `200`; missing finance config and missing API key fail closed.
- Test balances/dates: salary on 10th versus debt on 8th; no wrong claim that salary covers 8th; TWD opening is from real posted wallets only.
- Test FX missing, partial settled debt, duplicate monthly fund, overdue unresolved item, extreme amounts, empty ledger, invalid input, upstream 429/500/timeouts, prompt injection.
- API/AI failure does not disrupt Overview, Plan, Debts, Reports or Scenario, and never changes ledger/database financial amounts.
- Fixture tests for stable calculation IDs, no leak of other owner data, no unsafe HTML, no secrets in console logs.
- Existing finance schema/API regression, finance UI responsive, Caddy module contract, Kitchen staging/full cross-device regression and exact-head VPS deployment gates must pass.
- New AI activation is **not production-verified** until full GitHub Action release and authenticated owner acceptance; public anonymous smoke alone is insufficient.

## 7. Dependencies / coordination

- Canonicalize the debt-priority and salary-allocation implementation across PR #260/#261/#262 before making AI claims about debt optimization or assigning the next Finance migration number.
- Confirm private owner Finance login is unshared.
- The owner must separately configure an OpenAI API project and secret on VPS. Do not request secret values in GitHub issues, PRs or chat.
- During implementation, preserve `/api/finance/*` Caddy-only restriction, the isolated PostgreSQL volume and existing backup/restore mechanism.

## 8. New owner requirement — personal mentor + commitments rather than generic debt ranking (2026-10-18)

### Product objective and activity model
The user is busy and forgets bills and private-person debts. AI Mentor therefore has **two coordinated, separate behaviors**:
1. **Ask-to-analyze:** OpenAI conversation calls only on user send; fresh owner-specific financial snapshot, confirmed facts and deterministic rolling-day simulation. It may proactively *present* detected problems within its answer.
2. **Opt-in obligation reminders:** finance-owned deterministic rules run on schedule only with explicit owner permission; can produce in-app alerts, with browser push/email only if separately enabled and technically configured. No independent background OpenAI processing, no automatic account mutation.

A homepage “Mentor briefing” should quickly show **Hôm nay / 7 ngày tới / Trước kỳ lương / Quá hạn / Cần xác nhận** alongside unpaid known minimums, flexible obligations needing follow-up, next income date, minimum projected available balance and actionable links. Group high-priority items first. Persist notification state and deduplicate, do not send the same alert each hourly run. Never expose full creditor names or balances in device lock-screen notifications by default.

### Debt model: independent dimensions, not a binary 'personal loan is optional' shortcut
For each liability distinguish **creditor type**, **repayment contract**, **cash-flow urgency**, **relationship consequences**, **confidence**. A friend/family creditor can have a firm due date and a legally enforceable repayment contract; a bank may offer restructuring subject to approval. Creditor type alone must **never** silently decide payment deferral.

Suggested normalized creditor types: `bank_loan`, `credit_card`, `personal_friend_family`, `installment_provider`, `other`. User-facing Vietnamese examples: *Ngân hàng*, *Thẻ tín dụng*, *Người quen / gia đình*, *Trả góp*, *Khác*. Record native amount and currency, outstanding principal, interest APR or confirmed fixed fee/zero/unknown, min mandatory amount, statement full amount (credit card), grace period if contractually documented, penalty regime and exact due date where known. Avoid assuming that paying only card minimum is cost-free; show interest and remaining balance.

A second **required** repayment-obligation axis (not implied by creditor type):
- `fixed_contractual`: enforceable/agreed specific schedule, due day, amount; includes friend loan with a promised date.
- `agreed_flexible`: lender explicitly agreed an alternate schedule, record agreed amount/dates, timestamp and confirmation source. It still remains an obligation.
- `open_ended_unconfirmed`: no agreed due date yet. Show an expected check-in date separately from a legal or promised due date, and prompt the owner to confirm; do not invent deadlines or treat as forgiven.

Also separately track `payment_status` (planned, partly_paid, settled, overdue, renegotiation_pending), `relationship_priority` (user-chosen: high/medium/normal), `last_contact_at`, `next_contact_at`, `renegotiation_status`, and `next_income_date` from income schedules. “Asked creditor” ≠ “creditor agreed.” Display source of due date: contract / personal promise / estimate / unconfirmed.

Financial data semantics:
- `finance.debts` remains the obligation master, `finance.debt_payments` is immutable **actual posted repayment**, allocations are planned funding. Link stable IDs; an additional creditor terms/schedule table should be proposed in a Finance-only migration after current overlapping #260/#261/#262 migration settles.
- Schedule recurrence and each installment's amount, due date, paid amount, status, version and signed reminder history. Transfer carryover **unpaid obligations** to the next daily projection; never post a negative fictitious bank transaction merely because a planned bill could not be funded, nor roll it as new principal blindly. Interest, penalties and legal terms only from verified user-provided inputs; unknowns remain flagged.
- When bank loans/credit cards are involved, differentiate amount **required to remain current** from full outstanding balance and voluntary accelerated payoff; do not assume any grace period. For a personal debt, track both agreed repayment terms and relationship cost qualitatively as a user input, not as an invented monetary penalty.

### Priority engine — daily timeline and constraints
Apply **date-based obligations**, not fixed monthly bucket order:
1. Avoid immediate liquidity insolvency, cover known essentials and time-critical required payments, including fixed promised friend repayments. Calculate mandatory minimums and penalties separately.
2. If funds are inadequate, disclose the exact shortfall and date. Suggest conditional choices: request creditor-approved rescheduling, collect known receivables, pre-approved salary advance or permitted bridge funds. Evaluate total cost and long-term rollover impact; never assume approval or recommend skipping required payments as though consequence-free.
3. Reserve cash up to the next confirmed payday, including every documented bill due before payday and a configurable emergency buffer. A paycheck arriving afterward cannot retroactively fix an earlier due-date deficit.
4. Only allocate genuinely surplus funds to optional personal-debt acceleration, highest-interest debt repayment or savings goal. Compare APR, due date, contractual risk and owner-chosen relationship priority. Show alternative feasible calendars if relationship preservation matters more than interest savings.
5. Recompute recursively through upcoming paydays across a 365-day horizon, with daily balances, outstanding contractual requirements, posted-vs-planned reconciliation and clear assumptions.

Do not label friends as “low priority,” “optional,” or “can delay” without a documented agreement. Present bank/credit-card debt constraints and the option to contact a lender early, not automatic missed payments.

### Reminder timing and channel contract
- Suggested defaults in owner's Asia/Taipei timezone: 7 days before, 3 days before, 1 day before, and on due date, plus overdue daily until marked paid **where appropriate**. Configurable per liability; suppress repeats after settlement and do not trigger on a date whose validity is unknown.
- Additional high-value alerts: upcoming cash-buffer breach before next income, salary not yet confirmed when a debt deadline approaches, credit card statement/minimum due, forgotten personal-loan follow-up, and mismatch between planned fund and actual payment.
- Use owner-only `finance.notification_rules`, `finance.notification_events`, `finance.notification_preferences` or equivalent after schema reconciliation. Record stable obligation ID + occurrence + channel idempotency key, sent/seen/acknowledged timestamps, and create audit event; keep notification payload privacy-minimized.
- Require explicit opt-in independently for in-app, push and email; if push permission denied, provide in-app reminders instead. External delivery needs actual provider configuration and verification. Add mute/snooze/acknowledge controls, but a snoozed reminder must not silently alter the actual due date or mark debt paid.
- Avoid notification floods and compulsive reminders: daily digest by default with distinct urgent deadline alerts only when opted in, quiet hours, easy pause.

### Worked testcase — bank versus personal debt on two sides of a payday
**Entirely hypothetical; TWD.** 2026-11-27 posted cash 12,000; essential rent 6,000 on Nov 28; required card minimum 4,000 on Nov 30; personal friend A promised 12,000 on Dec 2; confirmed salary +58,000 on Dec 3. A second friend B is owed 10,000 but has no agreed repayment deadline, next contact date Dec 10.
- After rent and card minimum: Nov 30 cash 2,000, no bank payment missed. Friend A Dec 2 obligation 12,000 causes a **10,000 TWD cash shortfall**, **13,000 versus a 3,000 TWD buffer**. The Dec 3 salary does not prevent this breach.
- If A **agrees in advance** to move the 12,000 repayment to Dec 4 without penalty: Dec 3 balance after salary 60,000; Dec 4 balance 48,000. That is a conditional feasible restructuring, not a debt being ignored.
- Friend B 10,000 remains outstanding and must be shown in total liabilities and the relationship follow-up queue, but cannot be blindly dated as a December spend. The mentor could propose voluntarily allocating for B only after protecting all known December and early January commitments and checking agreement with B.
- If A does not agree, present available safe alternatives with confirmed dates/costs or an explicit warning of unresolved shortage, never invent bridge financing.

### UI and test additions
- Debt form: creditor type + obligation type + due/negotiation evidence + confirmed min amount, APR, late costs + relationship priority + optional reminder schedule. Conditionally show fields; no required invented rate for zero-interest friend debt.
- “AI Mentor → Khoản cần chú ý” separates `Bắt buộc đúng hạn`, `Đã thỏa thuận thay đổi`, `Cần xác nhận ngày trả`, `Trả trước tự nguyện`. Detailed why-prioritized explanation and side-by-side alternative cash calendars.
- Set up `Tôi quên khoản này` flag + acknowledgment, overdue review and proof-of-payment reconciliation with ledger. Do not auto-settle a debt from planned payments.
- Tests: friend fixed vs flexible vs unknown; renegotiation requested vs confirmed; credit card minimum vs full statement/APR; due-before-payday gap; carryover vs posted payment; lender partial payment; edited due dates; paid cancellation of scheduled reminder; timezone/DST edge; notification idempotency, opt-out, privacy, rate limits and no background AI usage.
- **Status:** new product/engineering requirements captured on this design-only PR; none are claimed deployed or live. Coordinate with issue #251 (recurring bills, minimum amounts, reconciliation, notifications).
