# Kasapink ERP release readiness

Checked on 9 October 2026 (Asia/Jakarta). No commit, push, deployment, cloud configuration change, or production database write was performed.

## Candidate changes

- JWTs are bound to the current account credentials and `updated_at` revision.
- Logout ends all sessions for that account; password changes return a replacement token and invalidate old tokens.
- Concurrent password changes and delayed logout requests cannot overwrite a newer account revision.
- Frontend session transitions clear cached queries.
- Development defaults use frontend port 5173 and backend port 5000; `API_PROXY_TARGET` can override the proxy destination.
- The Replit post-merge hook no longer performs an implicit database schema push.
- Repeatable mock and real PostgreSQL auth tests are available.

The working tree also contains changes that predated this work: user guides, the ERP route's `recipeUnit` response field, and untracked database introspection output. Keep them distinct when reviewing a future commit. The API bundle was regenerated from the current source and retains that response field.

## Completed validation

- All 8 mock-database auth scenarios passed.
- All 7 real PostgreSQL 17.11 auth scenarios passed, using a disposable local cluster and the actual Drizzle adapter. Account migrations `0005` and `0006` were applied only in that temporary cluster. Cleanup stopped the cluster and removed its files.
- Workspace typecheck, frontend/API production build, and standalone backend build passed in the preceding implementation step. The frontend build emitted a nonfatal sourcemap warning in `tooltip.tsx`.
- Production GET `/api/healthz` returned 200 with JSON, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN`.
- Production GET `/api/me` without credentials returned 401. No authenticated production requests or write requests were sent.

## Cloud configuration verified read-only

### Neon

The project named `ERP-Kasapink` has a default branch named `production` and database `neondb`. Only schema metadata was inspected; no user records or password hashes were read.

`public.erp_users` has the required non-null columns: `id`, `username`, `password_hash`, `role`, `created_at`, and `updated_at`. The timestamp columns use `timestamp with time zone`; the username has a unique index. The role enum contains `admin`, `testing`, and `user`.

The columns required by `0015_production_schema_compat.sql` are present: recipe `recipe_unit` and `conversion_factor`, preparation `yield_qty`, and waste `created_at`. This verifies the inspected schema, not the full migration history or every ERP table.

### Vercel

The linked `kasapink-erp` project uses Vite and Node 24.x. Its latest reported production deployment is READY and remains the existing deployment; the local changes are not live. Registered domains include `erp.kasapink.com`.

Environment metadata shows one sensitive `DATABASE_URL` entry and one sensitive `JWT_SECRET` entry, each targeting both production and preview, without a Git-branch override. Values were not decrypted or displayed. Consequently, the configured preview environment shares these entries with production. The exact database endpoint in `DATABASE_URL` was not compared with Neon because its value was not read.

## Remaining release conditions

1. Do not use the current shared preview configuration for authenticated write testing. Configure a dedicated test database and a separate JWT secret for preview first, then verify the effective deployment environment.
2. Review the working-tree changes and select the intended release scope, including the pre-existing edits.
3. Verify the changed frontend/auth behavior on an isolated preview before production rollout. Local PostgreSQL tests do not verify Neon TLS connectivity or Vercel runtime behavior of the new code.
4. When deployed, tokens issued by the old implementation will be rejected; users must log in again. The revision mechanism requires no new columns in the inspected account schema.
5. Commit, push, and deploy remain subject to the user's original restrictions until explicitly authorized. No cloud variables, branches, or deployment settings were changed during this review.

## 11-point implementation checklist

- [x] 1. Dangerous `clear-all` is disabled unless `ALLOW_DANGEROUS_CLEAR_ALL=true`; it has no UI entry point.
- [x] 2. Admin JSON export is available from the Reports page and `/api/erp/export`; `backup:erp` creates a local `pg_dump`; `restore:erp` is local-only and requires two explicit confirmation variables.
- [x] 3. ERP mutations write actor, route, method, status, and request details to `audit_log`; admins can inspect `/api/erp/audit-log`; exports include audit records.
- [x] 4. Sale lines persist a costing snapshot containing product, ingredient, preparation, units, conversion factors, and average costs at sale time.
- [x] 5. Disposable PostgreSQL integration coverage exercises the complete F&B path: ingredient → product → purchase/sale → preparation recipe/batch → preparation product → F&B report.
- [x] 6. Browser sessions use an HttpOnly `kasapink_session` cookie with SameSite protection; client code no longer stores JWTs in localStorage.
- [x] 7. Moving-average regression tests cover negative stock, recovery receipts, standard weighted average, preparation conversion, and concurrent sales.
- [x] 8. Integration coverage verifies `testing` can read but cannot mutate; admin performs the protected mutations.
- [x] 9. Final UI palette lock, login illustration, responsive styles, chart colors, action states, and semantic color contrast cleanup are applied.
- [x] 10. `/api/healthz` remains liveness; `/api/readyz` checks PostgreSQL readiness; pino request logging, migration sequence checks, and security smoke checks are available.
- [x] 11. Final local verification passed: typecheck, frontend build, API build, unit tests, auth session tests, disposable PostgreSQL F&B integration test, and security/API smoke test.

## Backup and reporting operations

- Daily backup installer: `pnpm backup:install` registers a local Windows Task Scheduler job at 02:00. The task runs `pnpm backup:erp` and keeps the latest 30 days by default (`ERP_BACKUP_RETENTION_DAYS` can change this).
- Manual database backup: `pnpm backup:erp` with `DATABASE_URL` set. Output defaults to `./backups` or `ERP_BACKUP_DIR`.
- Local restore only: set `ERP_BACKUP_FILE`, `DATABASE_URL` pointing to localhost, `ALLOW_ERP_RESTORE=true`, and `CONFIRM_ERP_RESTORE="RESTORE KASAPINK ERP"`, then run `pnpm restore:erp`.
- Report exports are available to admins on the Laporan page and via `/api/erp/report-export`: financial report, stock report, and transaction history in CSV, Excel-compatible `.xls`, and PDF.
- Export database JSON remains available as `Backup JSON` for a portable application-level snapshot.

### Verification notes

- Frontend build succeeds with one existing nonfatal Vite sourcemap warning in `src/components/ui/tooltip.tsx`.
- Cloud preview/production was not used for authenticated writes. No main-branch change, Neon production write, Vercel change, commit, push, or deployment was performed.
- Before real release, configure a separate preview database/JWT secret, apply migrations through the release process, run the same verification against preview, then obtain explicit deployment approval.
