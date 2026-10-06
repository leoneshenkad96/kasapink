# Kasapink authentication setup

## Required environment variables

- `JWT_SECRET`: random secret with at least 32 characters. Keep it private and the same across all API instances.
- `ADMIN_BOOTSTRAP_TOKEN`: temporary one-time token used to create the first admin if the database has no users. Remove it after setup.
- `DATABASE_URL`: the PostgreSQL connection string already used by the ERP.

Generate both secrets locally with Node.js, for example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Run this twice and put the results into the hosting environment settings. Do not commit secret values to Git.

## Database migration

Apply `lib/db/migrations/0005_user_roles.sql` to the production database before deploying the new API. If `erp_users` is missing, it creates the table. If the old table exists, it keeps usernames and bcrypt password hashes, carries over an existing `admin` role when present, promotes the oldest existing account to admin if needed, and removes the old `roles` and `permissions` columns.

## First login

If users already existed, sign in with an existing username and password. The migration ensures there is an admin account. If the table was empty, the login page shows **Buat admin pertama** while `ADMIN_BOOTSTRAP_TOKEN` is configured. Enter that token and choose the admin username and password, then remove `ADMIN_BOOTSTRAP_TOKEN` from hosting settings.

Admin accounts can create `admin`, `user`, and `testing` accounts from **Manajemen User**. Admin and user accounts can read and modify operational ERP data. Only admins can access `/api/users` and the **Manajemen User** menu. Testing accounts can read ERP data; the API rejects their write requests even if someone bypasses the UI. JWT access tokens expire after 12 hours, and the app also logs out after 20 minutes without activity.

## Add the operational user role

Apply `lib/db/migrations/0006_add_user_role.sql` to the production PostgreSQL database before deploying the updated API. Existing accounts retain their current roles. After deployment, an admin can create accounts with the new `user` role from **Manajemen User**.


## Security hardening

The API now applies production security controls:
- JWT_SECRET must be at least 32 characters. Access tokens expire after 1 hour.
- Login and admin-bootstrap endpoints are rate-limited in production.
- Request bodies are capped at 100 KB.
- CORS is restricted to origins listed in CORS_ORIGINS (comma-separated). Same-origin ERP requests continue to work without adding an origin.
- Security headers are enabled with Helmet; HSTS is enabled in production.
- ERP batch endpoints reject requests containing more than 100 items.
- DELETE /api/erp/clear-all is admin-only and additionally disabled unless ALLOW_DANGEROUS_CLEAR_ALL=true.
- Authenticated requests re-check that the JWT user still exists and that its username/role still match the token, so deleted users and changed roles lose access immediately.
- Passwords are capped at 128 characters to prevent unnecessarily expensive authentication requests.

For production, configure CORS_ORIGINS with the exact ERP origin(s), for example https://erp.kasapink.com. Do not enable ALLOW_DANGEROUS_CLEAR_ALL in production unless there is a controlled operational reason.
