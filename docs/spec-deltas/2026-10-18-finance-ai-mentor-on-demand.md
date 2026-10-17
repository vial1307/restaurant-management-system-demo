# Finance OS — AI Financial Mentor (On-demand chat)
**Date:** 2026-10-18  
**Status:** DESIGN / AUDIT ONLY — no AI service, credential or production deployment activated.  
**Source baseline audited:** `main` @ `bdfedcc9099f0f5c7b77d85eaeb40be197236490`.  
**Website:** https://finance.82.47.180.185.nip.io/  
**Scope:** private Finance OS only; no Kitchen business data, no changes to posted ledger, no autonomous transfers.

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
