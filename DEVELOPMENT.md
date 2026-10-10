# Local development on Windows

Use Node.js 24 (matching the linked Vercel project) and pnpm. Install dependencies with `pnpm install --frozen-lockfile` when necessary.

Start the backend and frontend in separate terminals from the repository root:

```powershell
pnpm --filter @workspace/api-server dev
```

```powershell
pnpm --filter @workspace/erp-rumahan-emak dev
```

The backend defaults to port 5000 in development. The frontend defaults to 5173 and proxies `/api` to `http://localhost:5000`. If a terminal already defines `PORT`, it overrides that process's default; use different ports in the two terminals. If the backend port changes, set `API_PROXY_TARGET` in the frontend terminal to the corresponding local origin.

Supply `DATABASE_URL` and a strong `JWT_SECRET` securely to the backend process. Do not point local development at production. The files `frontend.env` and `port.env` are not automatically loaded by these scripts. Never put database credentials or signing secrets in a `VITE_` variable.

## Validation

```powershell
pnpm test:auth
pnpm test:auth:postgres
pnpm typecheck
pnpm build
```

`test:auth` uses local HTTP and a database double. `test:auth:postgres` uses the real auth router, Drizzle adapter and PostgreSQL SQL in a new temporary local cluster. It deliberately replaces any inherited `DATABASE_URL` inside the test process, applies only the existing account migrations to that empty cluster, and uses generated test credentials. After the test it stops the cluster and removes its temporary directory, including on test failures. If stopping the server fails, cleanup fails visibly and leaves its directory intact.

The PostgreSQL test needs local `initdb` and `pg_ctl` executables. On Windows it defaults to `C:/Program Files/PostgreSQL/17/bin`; set `PG_BIN` to another installed binary directory if needed. On other platforms it uses executables on `PATH` unless `PG_BIN` is set. Run as a regular user, not a Unix root account. The test only listens on localhost and never uses an existing database or cloud branch.

Build writes frontend output and regenerates the tracked `api/index.js` bundle. Review that diff alongside the backend source.

`pnpm test:security` sends POST and DELETE requests expecting authentication failures. Run it only against an explicitly chosen test instance, not as a read-only production check.

## Database changes

The Replit post-merge hook only installs locked dependencies. It no longer changes database schema automatically. Review SQL separately, identify the exact database/branch, and validate migrations in an isolated environment before production use.

`lib/db/migrations/` contains manually maintained SQL changes. The untracked `lib/db/drizzle/` folder found during review contains an introspected baseline, not evidence of applied migrations. Do not execute it on an existing database or assume its journal matches production.
