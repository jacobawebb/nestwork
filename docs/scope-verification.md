# Scope verification

This table maps every required case in section 13 of the development scope to executable evidence. Test fixtures use only the disposable local D1 database created by `scripts/e2e-server.mjs`; migrations themselves contain schema only.

| # | Required behaviour | Automated evidence | Status |
|---:|---|---|---|
| 1 | A child cannot access another child's chores, history, balance, or goals. | `tests/integration/authorization-ledger.test.ts` — “never exposes another child’s chores, history, balance, or goals” | Verified locally |
| 2 | Child sessions cannot perform parent financial or review mutations. | `tests/integration/authorization-ledger.test.ts` — “blocks every parent-only mutation from a child session” | Verified locally |
| 3 | A simultaneous general-chore claim has exactly one winner. | `tests/integration/claim-review.test.ts` — simultaneous claim test | Verified locally |
| 4 | Approval is idempotent and creates one earning. | `tests/integration/claim-review.test.ts` — repeated approval in the simultaneous claim test | Verified locally |
| 5 | Rejection and return create no earning. | `tests/integration/claim-review.test.ts` — rejection/return test | Verified locally |
| 6 | An ordinary payout cannot overdraw a child. | `tests/integration/authorization-ledger.test.ts` — payout guard and concurrent-payout tests; `tests/unit/policies.test.ts` — negative-balance policy | Verified locally |
| 7 | Recurrence is idempotent. | `tests/integration/recurrence-setup.test.ts` — repeated 14-day materialisation | Verified locally |
| 8 | Completed chore instances retain their title and amount snapshots. | `tests/integration/claim-review.test.ts` — completed-instance snapshot test | Verified locally |
| 9 | Household identifiers cannot cross the tenancy boundary. | `tests/integration/authorization-ledger.test.ts` — cross-household identifier test | Verified locally |
| 10 | Parent/child sessions expire at exactly 10 seconds on both client and server, including hidden tabs and direct URLs. | `tests/unit/security.test.ts`, `tests/unit/policies.test.ts`, `tests/integration/authorization-ledger.test.ts`, and `tests/e2e/core-flow.spec.ts` | Verified locally |
| 11 | Phone/tablet flows support keyboard use and reduced motion. | `tests/e2e/accessibility.spec.ts` on phone and tablet Playwright projects | Verified locally |
| 12 | Returned general chores remain assigned until a one-time parent return-to-board. | `tests/integration/claim-review.test.ts` — returned general chore test | Verified locally |
| 13 | Expiry creates no earning and generated templates are archive-only. | `tests/integration/claim-review.test.ts` — expiry/archive test | Verified locally |
| 14 | `PARENT` cannot administer adults, invitations, or household settings; `OWNER` can. | `tests/integration/goals-roles.test.ts` — owner-role test | Verified locally |
| 15 | Setup is atomic and permanently closes after first completion. | `tests/integration/recurrence-setup.test.ts` and `tests/e2e/setup.spec.ts` | Verified locally |
| 16 | Secure hashing, sign-in, exact idle locking, and scheduled maintenance are benchmarked on the deployed Workers Paid runtime. | `scripts/benchmark-remote.mjs` and the README production-gate procedure | Ready to run; requires a deployed Worker and operator-supplied benchmark accounts |
| 17 | Children can view multiple goals and choose only their own spotlight without changing money or targets. | `tests/integration/goals-roles.test.ts`, `tests/integration/authorization-ledger.test.ts`, and `tests/e2e/core-flow.spec.ts` | Verified locally |
| 18 | A fresh migrated D1 database is empty and `/setup` is the only bootstrap path. | `tests/integration/recurrence-setup.test.ts`, `tests/e2e/setup.spec.ts`, and the fresh-database E2E launcher | Verified locally |

## Verification commands

```text
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

Case 16 is intentionally not marked verified until `pnpm benchmark:remote` succeeds against the actual deployment. Passing local Miniflare tests cannot substitute for that scope requirement, and this repository does not claim a production deployment or security certification.
