# Workforce payroll history and export

Date: 2026-09-13

## Goal
Each successful payroll-period lock appends an immutable revision snapshot. Reopen/relock creates a new revision without rewriting older ones. No new wage rules are introduced.

## Authority
Only admin/manager accounts with attendance edit authority may lock, reopen, view full payroll history, or export it. Supervisor remains non-authoritative. Employee/part-time self-service responses must not expose coworker payroll history.

## Calculation
Snapshots use the existing payroll calculation only: worked minutes from clock-in/out minus break; gross from worked minutes and hourly rate; existing scheduled-start lateness, grace, and fixed/per-minute late penalty; net is gross minus deduction with floor zero. Record formulaVersion 1. Do not add overtime, holiday, bonus, tax, insurance, or leave-pay rules.

## Storage
Use existing `business_state.modules.attendance.payroll.periods` JSONB. No SQL migration. Each month may contain server-owned `history`. A snapshot stores month, revision, snapshot id, formula version, TWD currency, lock time/actor, policy snapshot, approved attendance ids, detailed attendance pay facts, per-staff totals, period totals, and optional reopen metadata.

## Lifecycle
First lock creates r1. Reopen preserves r1 and records reason. After authorized corrections and reapproval, next lock appends r2. Repeated lock while already locked is idempotent and must not append a duplicate revision.

## UI/export
Payroll tab shows selected-month revisions newest first with lock actor/time, shifts, hours, gross, deductions, net, and per-staff totals. Legacy locked periods without history show an explicit no-snapshot notice. Manager/admin can export any stored revision as UTF-8 BOM CSV named `payroll-<site>-<month>-r<revision>.csv`. Export must use the stored snapshot, never current mutable attendance.

## Protection/tests
Generic business-state writes cannot forge, change, or delete payroll period history. Self-service period scoping omits history and totals. Regression must cover r1 creation, idempotent lock, reopen preservation, r2 after correction/reapproval, generic-write protection, self-service privacy, supervisor denial, snapshot-based CSV, and desktop/mobile parity.
