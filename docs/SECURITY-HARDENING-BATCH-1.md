# Kasapink ERP — Security Hardening Batch 1 (22 October 2026)

## Scope 1–3 and actual environment state

1. **Backup/recovery — partially completed.** Neon manual snapshot creation returned `snapshots limit exceeded`; automatic snapshot scheduling returned `backup schedule creation is not enabled for this project`. **No new managed Neon snapshot was created.** Existing manual snapshot dated 2026-10-13 was preserved. A copy-on-write, no-compute recovery branch `recovery-pre-hardening-2026-10-22` (`br-hidden-pine-b3d0mxvf`) was created from production and confirmed ready. This is an additional **recovery point**, NOT a substitute for an encrypted offsite `pg_dump` and restore test.
2. **Production/Preview isolation — configured.** New Neon branch `preview-uat-isolated-2026-10-22` (`br-lucky-hat-b3wit0vy`) created; Vercel `DATABASE_URL` and `JWT_SECRET` are now split into production-only and preview-only variables. Each Vercel deployment needs a fresh build to use changed environment variables. The Preview branch initially copied production data at a point in time. Restrict preview access and **sanitize the Preview database before using it as a demo**. Do not move production credentials into a public preview.
3. **Protect production branch — blocked by Neon plan.** Neon refused `protected: true`: maximum protected branches for the current plan. The production branch remains unprotected. Do not report this as completed.

## Daily offsite backup setup (requires external host)

`scripts/backup-erp.mjs` creates a PostgreSQL custom-format dump via `pg_dump`, verifies it with `pg_restore --list`, saves with restricted filesystem permissions on POSIX, and retains backups for `ERP_BACKUP_RETENTION_DAYS` (default 30 days). It uses `PGPASSWORD`, not a URL containing a password in the command line.

Run on an **always-on, trusted backup host** (the planned Mini PC, NAS, or separate CI runner), with PostgreSQL client tools and Node installed:

```bash
# Securely set DATABASE_URL in your host's secret store; do not paste it into a shell history or Git.
export ERP_BACKUP_DIR=/srv/secure-backups/kasapink
export ERP_BACKUP_RETENTION_DAYS=30
pnpm backup:erp
pnpm backup:check
```

The script does NOT schedule itself. Configure systemd timers (Linux) or `pnpm backup:install` (Windows) with an appropriate secret-injection mechanism. Store an **encrypted** second copy away from the database host. Run a full `pg_restore` into a disposable database and validate row counts and login (do not restore into production to test it).

**Operational acceptance remains open:** offsite backup scheduler is running, newest backup under 26 hours old, and disposable restore passes. Because of the current Neon plan constraints, enable managed snapshots/branch protection after obtaining an eligible plan; do not delete the existing snapshot just to make room.

## Preview isolation acceptance

- Production Vercel variables `DATABASE_URL` and `JWT_SECRET` target Production only.
- Separate Preview variables target Preview only; verify source branch ID in Neon.
- Vercel Preview deployment should remain protected with SSO/authentication.
- Do not add production credentials or production JWT signing keys to Preview.
- Do not run writes in Preview until its data is sanitized.
- Confirm production `/api/healthz` and `/api/readyz` after next deployment; test one read-only API request.
