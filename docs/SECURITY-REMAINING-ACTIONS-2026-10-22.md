# ERP Kasapink — Final verification and backup operations (22 October 2026)

## Completed and independently verified
- Vercel Production build uses patched Node 24.22.1; previous security PRs #25–#27 merged.
- CI build, auth, dependency scan and audit allowlist tests passed.
- Vercel Production & Preview DATABASE_URL and JWT_SECRET are separately scoped.
- Production database has erp_auth_rate_limit table; Preview has its own table.
- A no-compute Neon recovery branch was created from Production.
- Production historical audit-log metadata was screened without retrieving values. All 23 text matches for sensitive-looking audit keys proved to be `passwordChanged` (boolean) rather than actual `password`/`token` keys.

## Not yet satisfied — do not mark complete

**Recovery tooling follow-up:** [Local sync and encrypted recovery](LOCAL-SYNC-AND-RECOVERY.md) implements a stash-preserving fast-forward updater, Windows DPAPI-backed scheduled execution, AES-256-GCM backups, verified second copies, and full restores into generated disposable local databases. Restore passwords are no longer command arguments and URI query routing overrides are rejected. This supplies the missing tools; it does **not** activate a laptop scheduler, verify an actual Production backup, or grant device access. Production recovery acceptance remains open until the chosen host has successfully run it with independent storage and a separately retained recovery key.
1. **Independent scheduled encrypted offsite backup:** Neon automatic backup schedule, additional managed snapshot, and protected production branch are blocked by current project plan. Existing recovery branch is helpful but not a substitute for disaster recovery. Configure a trusted Windows host with PostgreSQL clients, patched Node 24 and the DPAPI installer above. `pnpm backup:erp` now requires `ERP_BACKUP_KEY` and `ERP_BACKUP_OFFSITE_DIR`; `pnpm backup:check` authenticates/decrypts the encrypted archive and verifies checksum, age and required tables. `pnpm restore:check` performs a **full restore into a generated disposable local DB** using `ERP_RESTORE_ADMIN_URL`. `pnpm restore:erp` is a separate deliberate local overwrite using `ERP_RESTORE_DATABASE_URL` and protected confirmation env vars. Never restore a test dump over Production. Old backups are retained automatically; review capacity and retention separately after proven recovery tests.
2. **Neon protected branch:** Upgrade to a plan with branch protection and enable the production branch. Do not delete the 2026-10-13 managed snapshot to make room until a verified separate backup exists.
3. **Laptop/mini-PC setup:** Connected provider tools cannot open or control a user's local terminal. Local OS setup, schedules, permissions, encryption keys, and PostgreSQL client installation require access from the user's device or a device-connected Work session.
4. **Authenticated business flows:** No Production credentials have been provided to this test run, so stock, sales, admin and UI paths requiring login are not certified. The Production Read-Only Smoke workflow verifies health, DB readiness, access-denied behavior and CSP without mutating data or trying passwords.

## Daily read-only monitoring
The `ERP Production Read-Only Smoke` GitHub workflow runs at 02:20 WIB and can be dispatched manually. It only performs HTTP GETs, checks the API ready response, and ensures unauthenticated access stays blocked. A failing job is not proof of compromise; inspect Vercel runtime errors, certificate changes and database availability.

## Backup archive integrity
`scripts/check-backup.mjs` verifies freshness, size and custom-format readability using `pg_restore --list`. This does **not** replace a real restore test; a readable archive can still be missing required application tables or have corrupted data blocks. Use a disposable restore as final acceptance.
