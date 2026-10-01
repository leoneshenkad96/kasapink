# ERP Rumahan Emak

A Bahasa Indonesia inventory, recipe, purchasing, sales, stock-count, and gross-profit app for a small family food business.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/erp-rumahan-emak` — ERP web app.
- `artifacts/api-server/src/routes/erp.ts` — ERP API and stock/cost transaction logic.
- `lib/db/src/schema/erp.ts` — persistent PostgreSQL schema.
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and validation.

## Architecture decisions

- Sales are rejected until every selected product has a recipe and enough component stock.
- Purchases update each ingredient's moving weighted-average cost; sales snapshot cost of goods sold when recorded.
- Purchase spending is reported separately from cost of goods sold; gross profit is revenue minus sold-product ingredient cost.
- The only seeded recipe is one packaged cracker per factory-made cracker; set actual recipes for other products before recording sales.
- Stock purchases, sales, and physical counts write stock movements in the same database transaction as the balance update.

## Product

The app helps track ingredient quantities, recipe requirements, stock purchases, daily sales, physical counts, and gross profit. New opening stock can be assigned a unit cost. The dashboard highlights low stock and the selected day's recorded sales.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Gross profit is an estimate from moving-average ingredient costs and does not include labor, utilities, rent, or other overhead.
- Backdated entries use the cost basis available when the transaction is recorded; they do not recalculate previously recorded sales.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
