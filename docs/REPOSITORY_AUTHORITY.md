# Repository Authority

`vial1307/restaurant-management-system-demo` is the single authoritative Kitchen OS source repository for all ongoing development, testing, CI/CD, VPS deployment, and production fixes.

The legacy repository `vial1307/restaurant-management-system` is historical/reference-only. Do not implement fixes, features, migrations, configuration changes, or parallel maintenance there.

When a historical change from the legacy repository is useful, first compare it against the current specification and architecture in this repository. Port only the still-missing behavior into this repository, adapt it to the current VPS/PostgreSQL architecture, add regression coverage, and deploy only from this repository.

Production authority remains:

`Browser/UI -> Kitchen OS VPS API -> PostgreSQL`

GitHub deployment source remains this repository's tested `main` branch.
