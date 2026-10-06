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

Admin accounts can create `admin` and `testing` users from **Manajemen User**. Testing accounts can read ERP data; the API rejects their write requests even if someone bypasses the UI. JWT access tokens expire after 12 hours, and the app also logs out after 20 minutes without activity.
