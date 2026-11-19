# Session state (2026-11-19)

## Goal
Pre-Stage-4 documentation update (OQ-10 refunds, OQ-11 deletion audit, OQ-12 adjustments, OQ-24 deleting an expense with refunds). No Stage 4 implementation. No commits, pushes, or branch changes; all Stage 3 changes stay uncommitted on `master`.

## Done
- OQ-10, OQ-11, OQ-12, OQ-24 closed in `docs/planning/open-questions.md` (user decisions, 2026-11-19). OQ-24: option 1, reject with `422 EXPENSE_HAS_REFUNDS`; the dialog lists refunds with links; nothing deleted implicitly.
- ADR-0021 Accepted (no pending note); ADR-0008 no longer marks ADJUSTMENT as proposed.
- [Proposed] markers for these decisions removed from financial-domain-model.md, entity-relationships.md, features.md, ADR-0021, ADR-0008.
- multi-currency.md: base-currency refund difference is never corrected artificially. requirements.md R-TX-13 notes the OQ-24 rule. implementation-stages.md Stage 4 prerequisites/tests updated.
- `pnpm docs:check` passed (1018 links, 71 files).

## Left
- User approval to start Stage 4 (implementation not started).

## Pitfalls
- Stage 3 account update contract still allows changing `currency`; Stage 4 must lock it once postings exist.
- `POST /me/base-currency-change` changes behaviour in Stage 4 (async job, `maintenanceState`); keep the response contract additive.
- `users.maintenance_state` column already exists (Stage 3 migration).
- Transfer-fee deletion (financial-domain-model.md, still [Proposed]) asks the user whether to delete the fee: an explicit choice, not automatic; confirm at Stage 4 start.
- Repo uses `eol=lf`; some working-tree docs have CRLF from earlier edits (harmless, normalized by git).
