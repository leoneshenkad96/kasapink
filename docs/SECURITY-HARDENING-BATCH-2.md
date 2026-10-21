# ERP Kasapink — Security Hardening Batch 2 (22 October 2026)

Items 4–7: audit log allowlist, browser protections, distributed login throttling, CORS and dependency scanning.

## Deployment order

1. Back up production or verify a recent protected recovery point; Snapshot schedule/branch protection remain constrained by Neon plan.
2. Apply non-destructive `lib/db/migrations/0024_auth_rate_limit.sql` to the **Preview** branch. Test login, logout, and API in Preview.
3. Apply the same table creation to the **Production** Neon branch before releasing the new API, otherwise the login middleware fails closed (503).
4. Release the code after CI passes; confirm login and `/api/readyz`, inspect Vercel error logs.
5. Run `pnpm audit --prod --audit-level high` on a trusted development runner and evaluate every finding.

## Risk mitigations

- ERP audit event `details`, `beforeData`, `afterData` and `reason` are constructed only from allowlisted metadata. Existing historic logs are not modified or deleted: review them separately with proper authorization.
- CSP is applied by `vercel.json` to frontend static files and by Helmet to Express API. Third-party scripts may be blocked; test production-like Preview rendering. Inline styles remain allowed temporarily for React compatibility.
- CSRF protection blocks cross-origin mutations and requires identifiable same-origin browser context for authenticated cookie sessions. Bearer API clients without cookies continue to work.
- Login and initial-admin setup use PostgreSQL-backed counters, shared across serverless instances. Other API requests retain per-instance in-memory throttling; use edge WAF/network controls for shared global API protection.
- `erp_auth_rate_limit` accumulates hashed bucket records; implement a reviewed retention cleanup job separately; never log raw IPs, credentials, or JWTs.
- Production CORS no longer explicitly trusts localhost origins.
- Dependency audit is added to CI; do not merge past critical findings without assessment.

## Open follow-ups

Preview was copied from production data and still requires sanitization before use as a demo. Managed Neon snapshots/protected-branch features remain unavailable on this plan. Test a full offsite backup restore before marking incident recovery complete.
