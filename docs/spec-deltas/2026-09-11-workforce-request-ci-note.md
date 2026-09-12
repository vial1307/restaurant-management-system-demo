# Workforce request CI gate note

The workforce leave/change-request phase is required to pass existing production gates without weakening them.

- `api-regression-v6.mjs` imports `workforce-request-regression-client.mjs` after the attendance approval regression.
- `workforce-approval-browser-regression.mjs` chains `workforce-request-contract-regression.mjs` and `workforce-request-browser-regression.mjs` so the existing workforce browser gate covers both approval/payroll and schedule-request flows.
- Full-device cross-browser, persistence, concurrency, and production smoke gates remain unchanged.

This chaining is intentional: it adds coverage without relaxing or replacing any existing deployment requirement.