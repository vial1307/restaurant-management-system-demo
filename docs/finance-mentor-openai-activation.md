# Finance Mentor — activate optional OpenAI chat on VPS

Finance Mentor's deterministic PostgreSQL cash-flow/creditor briefing is **always available** on production and does not need an OpenAI key. The chat tab is separately disabled unless the owner opts in.

## Prerequisites

- The main branch release (including `vps/finance/activate-mentor-ai.sh`) has passed CI and been **deployed**. The manual workflow refuses to run when deployed `/RELEASE` differs from the selected main commit.
- The Finance private Postgres container is running and the Finance OS owner can sign in.
- A valid OpenAI API **project key** that is allowed to call `gpt-5.6-terra` Responses API; API billing/budget is separate from the ChatGPT subscription. Set a project-level spend limit on the OpenAI Platform before activation.
- An operator authorized to manage secrets in this GitHub repository. Do not paste the key in a chat, PR, issue, screenshot or a workflow_dispatch input.

## Owner setup (one time)

1. In the repository `vial1307/restaurant-management-system-demo`, open **Settings → Secrets and variables → Actions → New repository secret**.
2. Enter the secret name **`FINANCE_OPENAI_API_KEY`** and its real API project key as the secret value. The existing `VPS_SSH_KEY` workflow secret is used for the SSH connection; do not change it.
3. Go to **Actions → Finance Mentor AI Activation (manual) → Run workflow**. Select branch **main**, action **activate**, and confirm.
4. GitHub Actions validates the deployed release, passes the key via protected job environment and SSH **stdin**, invokes the root-owned exact-command activator, restarts only the API service, probes the provider from that running container, and verifies the unauthenticated Finance status endpoint stays **401**. It does not print, upload or commit the key.
5. Reload the owner's Finance OS session. The AI Mentor should now let the owner submit a chat message. It still never posts ledger entries or schedules autonomous money transfers.

The activation step makes one small Responses API smoke request, which may be billable. If the model/project lacks access, the quota is insufficient, the VPS cannot reach the provider or the API becomes unhealthy, the script restores the previous private .env and recreates the previous API configuration. The Finance/Kitchen Postgres DB files and ledgers are not modified.

## Status, disable and troubleshooting

- **status**: the same manual workflow with action `status` checks the container's enable flag without showing the API key. This requires no `FINANCE_OPENAI_API_KEY` secret.
- **disable**: the same manual workflow with action `disable` stops AI chat and removes `OPENAI_API_KEY` from the VPS .env, without changing private Finance transactions or removing already stored Mentor conversations. Rotating/revoking the OpenAI API project key is a separate action on the OpenAI Platform.
- **GitHub secret missing:** workflow returns `FINANCE_OPENAI_API_KEY_MISSING`.
- **Invalid secret format:** server returns `FINANCE_AI_KEY_FORMAT_INVALID`.
- **Invalid/restricted key or missing budget:** provider probe returns `FINANCE_AI_PROVIDER_HTTP_401/403/429` and rolls back. Do not post keys or raw provider errors into an issue.
- **Outdated production release:** run the standard gated production deploy first, then re-run the manual AI activation. It will not install a secret onto an unverified commit.
- **VPS unreachable/SSH errors:** connect Desktop Commander or repair the existing VPS SSH secret/authorized key; don't downgrade .env permissions.
- **AI chat configured but the owner sees errors:** check the owner session, browser console (without private financial data), and backend logs scrubbed of credentials. Existing status/analysis remains available with chat disabled.

## Privacy and cost boundaries

- OpenAI input includes real **financial projections and creditor names** from the owner-scoped PostgreSQL snapshot, plus recent chat history, only when the owner sends a message. It is not a fictional demo. `store:false` prevents OpenAI response storage by default, but processing of financial data still occurs at the API provider, so the owner should explicitly choose activation.
- Stored chat history resides in the Finance PostgreSQL DB, not Kitchen DB or browser localStorage. The owner can delete conversations from the Finance UI.
- Default model `gpt-5.6-terra`; guardrails exist for individual request timeouts and owner rate limits, but they are not a substitute for an OpenAI project hard spend limit.
- **No scheduled reminders, push/email alerts or AI runs in the background** are enabled by this workflow.
- Only one app container is force-recreated. Production availability may briefly pause during configuration; manual activation is safer at a quiet time.
