# Family Chores

A private, shared-device household app for chores, pocket-money records, and child savings goals. Version `0.1.0` runs as one Cloudflare Worker with Static Assets, one D1 database, and one hourly Cron Trigger. It does not move money, connect to a bank, host public child accounts, or require any additional Cloudflare service.

The application is implemented end to end: first-time setup, adult invitations, the shared-device profile selector, parent-password and child-PIN sessions, a server-enforced 30-second idle lock, role controls, multi-child assigned and general chores, recurrence, review, an append-only ledger, payouts/corrections, goals, audit history, and responsive phone/tablet/desktop UI.

> Production gate: the repository includes an executable remote-runtime benchmark, but a benchmark result is deliberately not committed or claimed. Run `pnpm benchmark:remote` against the deployed Worker before declaring that deployment production-ready. See [Remote deployment benchmark](#remote-deployment-benchmark).

## Architecture

- React 19 and React Router 8 in client-side data-router/library mode
- Vite 7 and Tailwind CSS 4
- One Hono API inside one Cloudflare Worker
- Worker Static Assets for the built React application; there is no server-rendered React
- One D1 database, queried through prepared statements with a Drizzle schema definition and ordered SQL migrations
- One hourly scheduled handler for the current-day-plus-14-day recurrence horizon and stale-state cleanup
- Zod contracts shared by forms, API handlers, and tests
- scrypt credentials with unique 128-bit salts and the OWASP 16 MiB profile (`N=2^14`, `r=8`, `p=5`)
- Profile-led colour themes: each person chooses an avatar colour, and their signed-in view uses accessible shades of that colour for its canvas, surfaces, navigation, controls, and focus states
- Vitest with isolated Miniflare/D1 databases and Playwright against the built Worker

The schema is migration-only. There are no seed or demo household records in development or deployment. Playwright creates a household only inside its disposable `.wrangler/e2e-state` database through the real `/setup` wizard.

Credential-format assumption: version `0.1.0` accepts only the current `scrypt` encoding. The switch from the pre-release PBKDF2 encoding required no data migration because the affected production setup failed while deriving the first owner hash, before the atomic household-creation batch ran. Do not point this release at an already-initialized pre-release database containing PBKDF2 credentials without first planning an owner/child credential-reset migration.

## Prerequisites

- Node.js 24.20.0 LTS (the explicitly pinned release used by Cloudflare Builds and CI)
- pnpm, npm, Yarn, or Bun
- A Cloudflare account only for remote D1/deployment work; local development uses Wrangler's local D1 implementation
- Chromium installed by Playwright when running E2E tests for the first time

Do not treat a check run under a different local Node release as release evidence. CI and Cloudflare production builds use the exact version in `.node-version`.

## Install dependencies

Choose one package manager and use it consistently within a checkout.

### pnpm (recommended)

The committed `pnpm-lock.yaml` and CI use pnpm 11.24.0, so this is the reproducible release path.

```sh
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
```

### npm

```sh
npm install
```

### Yarn

```sh
corepack enable
COREPACK_ENABLE_PROJECT_SPEC=0 yarn install
```

On PowerShell, set `$env:COREPACK_ENABLE_PROJECT_SPEC = '0'` for the shell before running `yarn install`. This opt-out is necessary because the standard `packageManager` field intentionally pins pnpm for Cloudflare's automatic installer; standalone Yarn installations that do not use Corepack are unaffected.

### Bun

```sh
bun install
```

Dependencies are exact-pinned in `package.json`, but only the pnpm lockfile is committed. npm, Yarn, and Bun may produce their own local lockfiles and a different transitive dependency graph. Use pnpm with `--frozen-lockfile` for CI, releases, and exact reproduction unless the repository intentionally adopts and commits another manager's lockfile.

Cloudflare Workers Builds normally supplies its own default tool versions. This repository overrides them: `.node-version` pins Node.js 24.20.0 LTS and `package.json#packageManager` pins pnpm 11.24.0. The checked-in `pnpm-workspace.yaml` also declares the single package root explicitly, keeping the workspace valid across supported pnpm releases.

For a defense-in-depth dashboard override, set these values under **Worker → Settings → Build → Build variables and secrets**:

```text
NODE_VERSION=24.20.0
PNPM_VERSION=11.24.0
```

The repository files are version-controlled; the dashboard values make Cloudflare's dependency-install phase use the same versions even if its automatic detection changes.

### Command equivalents

All package scripts are package-manager-neutral. The rest of this README uses pnpm for brevity; use the corresponding form below when working with another manager.

| Task | pnpm | npm | Yarn | Bun |
| --- | --- | --- | --- | --- |
| Run a script | `pnpm <script>` | `npm run <script>` | `yarn <script>` | `bun run <script>` |
| Run a local binary | `pnpm exec <binary>` | `npx <binary>` | `yarn exec <binary>` | `bunx <binary>` |
| Apply local migrations | `pnpm db:migrate:local` | `npm run db:migrate:local` | `yarn db:migrate:local` | `bun run db:migrate:local` |
| Build and run the Worker | `pnpm worker:dev` | `npm run worker:dev` | `yarn worker:dev` | `bun run worker:dev` |
| Run all local checks | `pnpm check` | `npm run check` | `yarn check` | `bun run check` |
| Run browser tests | `pnpm test:e2e` | `npm run test:e2e` | `yarn test:e2e` | `bun run test:e2e` |
| Deploy | `pnpm deploy` | `npm run deploy` | `yarn deploy` | `bun run deploy` |

## Fresh local setup

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Replace `BOOTSTRAP_SECRET` with a random value of at least 32 characters. For example, use `openssl rand -base64 48` on macOS/Linux or the following in PowerShell:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

3. Apply the schema to the local D1 database:

   ```sh
   pnpm db:migrate:local
   ```

4. Build and run the complete Worker locally:

   ```sh
   pnpm worker:dev
   ```

5. Open `http://127.0.0.1:8787/setup`, enter the bootstrap secret, and complete the wizard. Migrations do not create a household; successful wizard completion is the only bootstrap path.

For frontend hot reload, build once and run two terminals:

```sh
pnpm build
pnpm dev:api
```

```sh
pnpm dev
```

Open `http://127.0.0.1:5173`; Vite proxies `/api` to the local Worker. Use the single-Worker command for final verification because it exercises the deployed shape.

## Setup wizard and roles

Before initialization, the application redirects non-setup browser routes to `/setup`. The visitor must unlock setup with the deployment-only `BOOTSTRAP_SECRET`; that secret is never returned or displayed. The setup session is IP-bound, short-lived, HttpOnly, and single-use.

The wizard collects:

- household name, locale, IANA time zone, and currency;
- the first adult's `OWNER` profile and password;
- zero or more child profiles with built-in avatar/accent choices and 4–6 digit PINs;
- optional single-use, seven-day invitations for additional adults as `PARENT`;
- default approval, child-release, board-limit, and savings-goal settings.

Household, owner, settings, initial children, invitations, and the initial owner session are committed in one D1 batch. A failure leaves no partial household. Once the installation row exists, bootstrap permanently returns `410` even if the environment secret is unchanged.

There is exactly one active `OWNER` per household. An `OWNER` can manage household settings, invitations, and adult accounts. A `PARENT` can manage children, chores, reviews, goals, payouts, adjustments, and reversals, but cannot alter household settings or adult access. A child can act only on their own assigned/claimed chores, ledger, and active goals.

## Shared-device selector and ten-second lock

After setup, `/` shows only profile names, built-in avatars, accent colours, and Adult/Child labels. It never includes balances, chores, goals, or history. Adults enter their profile email and password; children enter their profile PIN.

Both client and server implement the idle boundary:

- D1 stores opaque, hashed session tokens plus `idle_expires_at`.
- Every authenticated request conditionally verifies that the session is unrevoked, active, and strictly unexpired before renewing it.
- The browser keeps household data only in React memory and schedules a lock from the server expiry.
- `pointerdown`, `touchstart`, `keydown`, and `input` are meaningful activity. Touch calls are coalesced to at most one every 200 ms.
- No later than ten seconds after the last meaningful activity, memory is cleared and the browser returns to the selector.
- When a hidden tab becomes visible, it rechecks the server before displaying private state.
- A stale cookie, refresh, direct child/parent URL, throttled timer, or failed client callback cannot bypass the D1 expiry check.

Five failed bootstrap, adult-password, or child-PIN attempts for the same target/profile and IP produce a D1-backed 15-minute lockout. Login errors do not disclose whether an adult email was correct, and unknown/deactivated credential paths perform the same slow verifier.

## Chores, recurrence, and history

Parents create `ASSIGNED` chores for one or more children, or `GENERAL` chores for the Chore Board. Each selected child receives an independent instance, so one child completing a shared household chore never completes another child's copy. A chore is only added to the reusable template library when its creator selects **Save to template library**; this keeps the library intentional rather than duplicating every scheduled chore.

Schedules support one time, every N local calendar days, and selected weekdays every N local weeks. Rules are interpreted in the household IANA time zone; materialized timestamps are UTC. Only today and the following 14 local calendar days are materialized. `(template_id, occurrence_key, assigned_child_id)` uniqueness and `INSERT OR IGNORE` make repeated cron runs idempotent. The parent chore list stacks equivalent recurring copies, while preserving independent actions for every child and occurrence.

The hourly job advances scheduled availability, expires unfinished instances, removes old lockout rows, and fills the bounded recurrence horizon. API reads and mutations also refresh/reject expired state, so cron timing is never a correctness boundary. Parents can cancel any unfinished instance; this is especially useful for a no-expiry chore that should no longer remain open.

General claims use one conditional D1 update, so only one child can win. Parent approval and auto-approval use the instance's title/value/currency/approval snapshots and a unique chore-ledger relation. Retries cannot credit twice. Return-to-child preserves the claimant and displays the parent's explanation to that child; Return to board is a separate parent action that clears a general claimant exactly once.

Parents can filter instance history by child, status, and local date, and can edit any open chore from its card. Saving an edit cancels and replaces open scheduled copies with the revised schedule; completed, reviewed, expired, and cancelled history remains immutable. A template with no instances may be deleted; after any instance exists it can only be archived. Instance, ledger, and audit deletion is blocked by schema triggers.

## Ledger and goals

Balances are always derived from the append-only ledger:

- `EARNING`: exactly one per approved/auto-approved instance;
- `PAYOUT`: full or partial real-world money already given to the child;
- `ADJUSTMENT`: an explicit correction with a reason;
- `REVERSAL`: a new correction record that leaves the original event intact.

Money is stored as integer minor units. Concurrent negative mutations use a conditional insert against the current aggregate, so simultaneous payouts cannot overdraw a balance. A payout never exceeds the available balance; deliberately creating a negative balance requires a separate negative adjustment, its confirmation, and a recorded reason.

Parents can create, edit, reorder, and archive multiple goals. Children may choose one active spotlight goal. Every goal independently displays the same available balance; goals never reserve, divide, transfer, or award money. Disabling goals hides selection/creation while preserving existing records for later re-enablement.

To avoid mixing immutable money history, household currency can change only while the ledger is empty. Locale remains editable. A time-zone change always requires an explicit confirmation; existing UTC instance/history timestamps do not move, while future materialization uses the new zone.

## Environment and bindings

| Name | Location | Purpose |
| --- | --- | --- |
| `BOOTSTRAP_SECRET` | `.dev.vars` locally; Wrangler secret remotely | One-time setup unlock. Use 32+ random characters. |
| `ENVIRONMENT` | `.dev.vars`/Wrangler vars | `development`, `test`, or `production`; controls secure cookies and HSTS. |
| `APP_VERSION` | Wrangler vars | Version shown to the owner. Production is `0.1.0`. |
| `APP_COMMIT` | `.dev.vars`/Wrangler vars | Optional deployment commit identifier shown to the owner. |
| `DB` | Wrangler D1 binding | The only application database. |
| `ASSETS` | Worker Static Assets binding | The built Vite application. |

Never put a real bootstrap secret in `wrangler.jsonc`, source control, a URL, or a command-line argument. `.dev.vars` is ignored.

## Database migrations

The initial schema is `migrations/0001_initial.sql`; subsequent invariant triggers begin at `0002`. Migrations are append-only and ordered:

```sh
pnpm db:migrate:local
pnpm db:migrate:remote
```

Never edit a migration that may have run remotely. Add a new numbered migration, test it against a disposable local D1 database, export the remote database, then apply it. D1 prepared statements and indexes are part of the correctness/performance model; do not move business rules into client code.

## Tests and quality gates

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs typecheck, lint, the Vitest suite, and the production build. Playwright deliberately starts a second Worker on port `8790`, deletes only the validated `.wrangler/e2e-state` directory, applies migrations, completes the real setup UI, and tests Chromium at phone, tablet, and desktop viewports. Its coverage includes keyboard use, reduced motion, horizontal overflow, the full assigned-chore/review/ledger/payout/goal flow, hidden-tab expiry, and a direct protected URL after lock.

GitHub Actions repeats the gates on Node 24.20.0 LTS and installs only Chromium. Unit/integration fixtures exist only in isolated Miniflare D1 databases.

The complete section-13 requirement mapping, including the deliberately external remote-runtime gate, is recorded in [`docs/scope-verification.md`](docs/scope-verification.md).

## Cloudflare deployment

The checked-in deployment shape uses the existing `nestwork-production` D1 binding in `wrangler.jsonc`. If deploying in a different Cloudflare account, first create one D1 database and replace `database_id` with the returned ID:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create nestwork-production
```

Then deploy in this order:

1. Run all local quality gates, including Playwright.
2. For an upgrade, export a backup before applying a migration.
3. Configure the only secret interactively:

   ```sh
   pnpm exec wrangler secret put BOOTSTRAP_SECRET
   ```

4. Apply remote migrations:

   ```sh
   pnpm db:migrate:remote
   ```

5. Build/check and deploy the Worker:

   ```sh
   pnpm deploy
   ```

6. Confirm `/api/bootstrap/status`, open `/setup`, and complete the one-time wizard.
7. Run the required remote benchmark below before calling the deployment ready.

The pinned compatibility date is `2026-08-28`. The config creates one hourly `0 * * * *` trigger and no R2, Images, Stream, Queues, KV, Durable Objects, or third-party auth service. This repository has not deployed or security-certified a production account merely by providing these commands.

## Scheduled maintenance

Run the local Worker with `--test-scheduled` (the provided commands do this), then invoke the same scheduled handler with:

```sh
pnpm cron:local
```

An authenticated `OWNER` can also call the idempotent manual-maintenance API. The remote benchmark uses that path and records an audit event. It is not needed for normal hourly operation.

## Remote deployment benchmark

This is a mandatory post-deployment gate because Worker CPU characteristics—not a laptop—determine whether the 600,000-iteration parent and child verifier is appropriate on the existing Workers Paid plan. The script does not bootstrap or seed the target. It finds configured profiles by selector name, performs multiple correct sign-ins without logging credentials, invokes the real maintenance service, waits 10.1 seconds, and verifies that D1 rejects the stale child session.

Set credentials only as environment variables in a trusted shell/session:

```text
BENCHMARK_BASE_URL=https://your-worker.example.com
BENCHMARK_PARENT_NAME=<existing owner display name>
BENCHMARK_PARENT_EMAIL=<existing owner email>
BENCHMARK_PARENT_PASSWORD=<owner password>
BENCHMARK_CHILD_NAME=<existing child display name>
BENCHMARK_CHILD_PIN=<child PIN>
BENCHMARK_SAMPLES=3
```

Then run:

```sh
pnpm benchmark:remote
```

A passing run exits zero and prints JSON containing the target host, algorithm/work factor, individual and median parent/PIN sign-in times, maintenance duration/result, observed lock duration, and `staleSessionRejected: true`. Save the dated result with deployment records, review Worker CPU/request metrics, and remove the credential variables from the shell. Do not lower the work factor merely to make this gate pass; investigate the paid-runtime result and intentionally change the security design with a migration/release note if it is unsuitable.

## Backups and restore

Before every remote migration or owner-recovery operation:

```sh
pnpm db:backup
```

This writes ignored `backup.sql`. Rename it with a UTC timestamp and store it in access-controlled backup storage; it contains private household data and credential hashes. Verify the export is non-empty. Practice restore into a newly created disposable D1 database by pointing a temporary Wrangler config at that database and running:

```sh
pnpm exec wrangler d1 execute <disposable-database-name> --remote --file <backup-file.sql>
```

Check table counts, ownership, and ledger totals before treating a backup as usable. Do not import a full export over a live populated database without a reviewed recovery plan.

## Owner password recovery

Version one intentionally has no email reset or public recovery endpoint. Recovery is an operator task:

1. Schedule a maintenance window and export/verify a backup.
2. Confirm the exact owner row with a read-only D1 query. Do not infer the owner ID from UI input.
3. Put the new strong password in the environment without inlining it into shell history, generate a compatible salted hash, and immediately clear the variable afterward. For a POSIX shell:

   ```sh
   export CREDENTIAL_KIND=parent
   read -rs CREDENTIAL
   export CREDENTIAL
   pnpm credential:hash
   unset CREDENTIAL CREDENTIAL_KIND
   ```

   In PowerShell 7, use `$env:CREDENTIAL_KIND = 'parent'`, then `$env:CREDENTIAL = Read-Host 'New owner password' -MaskInput`; run `pnpm credential:hash` and remove both environment variables with `Remove-Item Env:CREDENTIAL, Env:CREDENTIAL_KIND`.

4. Create a temporary SQL file outside source control that updates only the confirmed active `OWNER` row's `password_hash` and revokes all of that parent's active sessions. Use an ISO UTC value such as `strftime('%Y-%m-%dT%H:%M:%fZ','now')` for `revoked_at`.
5. Review the SQL and exact IDs, then execute it with `wrangler d1 execute ... --remote --file <recovery.sql>`.
6. Delete the temporary SQL/hash material, sign in through the normal selector, verify ownership/settings, and retain the recovery audit/backup record operationally.

Never change a role, create another owner, disable constraints/triggers, or expose a reset route as part of password recovery. Child PIN resets are available to parents in the People screen and revoke that child's sessions.

## Cost guardrails

- Keep the deployment at one Worker, one D1 database, one Static Assets bundle, and one hourly Cron Trigger.
- Do not add R2, Images, Stream, Queues, KV, Durable Objects, external auth, email, or monitoring storage for version one.
- The 14-day materialization window, indexed list queries, finite board limit, and old-lockout cleanup bound recurring D1 work.
- Review Worker requests, CPU time, D1 rows read/written, and Cron results after the remote benchmark and during normal use.
- Structured Worker errors and scheduled summaries go to Cloudflare logs when viewed; persistent observability is disabled in config to avoid an unreviewed extra cost.
- Treat a Wrangler major, compatibility-date change, hash-work-factor change, or schema change as a tested release—not routine drift.

## Dependency and compatibility upgrades

Runtime and tool versions are exact-pinned in `package.json` and `pnpm-lock.yaml`; there is no floating `latest` policy. For a patch/minor update, review release notes and rerun every gate. For a major dependency, Wrangler major, or compatibility-date change:

1. create an intentional change with a migration/compatibility note;
2. back up remote D1 if storage/runtime behaviour may change;
3. test migrations from a fresh and an existing database;
4. run Vitest, the full device E2E suite, and the remote benchmark;
5. record the change in `CHANGELOG.md` before deployment.

## Material implementation assumptions

- One deployment represents exactly one household. Multiple households in one platform are deferred.
- `BOOTSTRAP_SECRET` remains configured after setup but can never reopen bootstrap because D1 installation state is authoritative.
- Additional adult invitations expire after seven days, are single-use, and always create `PARENT`, never `OWNER`.
- Parent approval is the initial default; owners may change the default and parents may override an individual template.
- A child profile is intentionally discoverable only on that household's selector by display name/avatar/label; no private household data is included there.
- The server's UTC clock is authoritative for session and instance expiry. Recurrence is calendar-based in the configured household IANA zone.
- Existing instance snapshots and ledger currencies are historical facts. Currency therefore becomes fixed after the first ledger entry.
- Archiving a template prevents future horizon materialization but does not silently rewrite/cancel existing instances. Parents explicitly cancel unwanted open instances.
- Audit history is visible as recent parent-dashboard activity; immutable rows remain available for operational queries beyond the most recent UI list.
- The UI is English in v1, while locale-aware dates/currency and typed message boundaries leave room for later translation work.

## Deferred after version one

- bank/payment integrations and child debit cards;
- push, email, or SMS reminders;
- photo/video evidence and media storage;
- public sharing, messaging, social features, streaks, leaderboards, and sibling comparisons;
- full offline synchronization;
- advanced allowance, tax, interest, bonus, penalty, or automatic-deduction rules;
- multiple households per platform administrator;
- native iOS/Android applications and a full installable PWA;
- additional UI languages.

See `CHANGELOG.md` for release history and `docs/design/design-system.md` for the calm, low-motion visual rules used by the implementation.
