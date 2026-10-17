# Finance FX estimation — daily reference rates (2026-10-17)

## Objective and meaning
- The only unified forecast reporting unit is **TWD**. Foreign-currency original amounts (VND/USD/JPY/EUR/CNY) are preserved. Conversion is **indicative** and never means cash has been exchanged.
- Source: [ExchangeRate-API Open Access](https://www.exchangerate-api.com/docs/free); mandatory visible attribution. Its reference data refreshes roughly once daily; no bank bid/ask spread, settlement fee or FX risk can be inferred from a midpoint rate.
- A protected Finance-only GET `/api/finance/fx/estimates` reads a cache in the dedicated finance PostgreSQL `finance.fx_rates`. Its server-side fetch URL is fixed: `https://open.er-api.com/v6/latest/TWD`.
- The backend records the original provider observation time, validates it against a 72-hour freshness window, retries at most once every 10 minutes during gaps and refreshes after 26 hours when rates are healthy. No guesswork: missing/stale quotes return null with visible warnings. Frontend allows transparent manual rate input for planning if the provider is unavailable.

## Cashflow and debt modeling
- Migration 005 adds the source currency, source amount, rate, rate timestamp/provider to monthly cashflow items and backfills legacy TWD items unchanged.
- New monthly income/expense rows can be entered in a native currency. The **server** computes whole-TWD plan values using decimal integer (BigInt) arithmetic. These values feed the existing monthly/yearly reports and 30/60/90-day advisor, plus scenario base schedules. The native amount remains available to edit.
- Monthly foreign goal/debt allocations resolve the common indicative FX snapshot when no explicit rate is entered. Older allocations keep their saved rate **until the owner edits** them: this guards against silently rewriting earlier planning decisions.
- Planned FX remittances auto-fill an expected currency-to-currency conversion using the same TWD reference (but forecasted TWD outflow still depends on the funding wallet, and cannot assume an unknown foreign wallet is liquid TWD).
- Simulated income/expenses can be entered through a native-currency helper that inserts a TWD-equivalent row labeled with the original amount/currency and rate-date provenance. Changing today's quote **does not silently reprice previously saved what-if rows**.
- Any foreign wallet valuation and foreign debt valuation shown on the dashboard are reference estimates only. They are **not** added to TWD cash available for bills or minimum reserve. A conversion or transfer requires a separately posted real transaction.
- Imported indicative rates must **not** be used to overwrite the historical `toTwdRate` of actual posted income, spending, forex exchange or debt payment. User-entered actual realized rates and posted balances are immutable.

## Safety, privacy and proof
- Owner access required for FX estimate endpoint; anonymous is 401, other restaurant users are 403.
- Finance DB only; no Kitchen DB migration; provider call transmits no user balances, debts, schedules or identifiers.
- Public third-party quotes are data, not authenticated actual bank settlement prices; no redistribution of raw provider data, show source and timestamp.
- CI validates duplicate migration application, automatic conversion of 1,000,000 VND at a **test-only seeded 0.00125 TWD/VND** into 1,250 TWD, preserving original VND units, missing/stale FX rejection, callback fetch contract, owner authorization, no change to posted wallets, and 320/390/1440 responsive forms. Seeded test rates are never production defaults.
- **Known limits:** Daily snapshot rather than intraday FX; no fees/spreads predicted unless user enters fees; does not auto-execute transfers, does not auto-revalue saved plans, and cannot guarantee future settlement rate.
