# Responsive layout and recipe builder review

Base: main at d8360db61caa77fed9a0d71f70a5ce739dbeb3a0. Production deployment requires owner approval.

## Audit findings and fixes

- Prep hero's non-shrinking horizontal workflow and intrinsic child widths could widen the mobile page. Allow wrapping, constrain grid children, stack workflow on small screens, and use one stock-card column on mobile / two on tablet.
- Two modal implementations had whole-dialog scrolling and lacked a consistent focus/scroll lifecycle. Consolidate forms on Radix Dialog, lock background scrolling, trap/restore focus, keep the header outside the internal scroller, use a sticky action area and dynamic viewport/safe-area limits. Preserve unsaved-change confirmations and block dismissal while saving.
- Product recipe forms rendered every ingredient. Replace with a searchable stock picker, compatible unit dropdown, decimal quantity field, editable draft list, duplicate prevention and explicit final save. Reuse builder in Prep recipes; do not automatically add the first ingredient.
- Inline Route component factories remounted pages when ERP/health data changed. Render stable route children so background refresh does not erase local drafts.
- Discrete units such as pack, box, pcs, and butir were treated as interchangeable 1:1. New recipe saves only convert kg/gram and liter/ml; discrete/custom units must match the stock unit exactly. Existing stored conversion factors and historical transaction snapshots remain untouched.
- Recipe quantities use numeric(14,3). Validate precision before saving rather than allowing the database to silently round tiny quantities. Users can select gram/ml for smaller usage.
- Existing product/prep recipe handlers already lock their parent row and replace the entire recipe within a transaction that includes the version snapshot. Preserve that mechanism and verify rollback after an injected snapshot-write failure.

## Validation

- Workspace TypeScript check and production build passed. Build retains a pre-existing tooltip sourcemap warning.
- Palette check passed.
- Browser coverage: 320, 375, 390, 430, 768, 1024, 1280, 1440, 1920 px; 12 routes with populated stock/products/prep and long names; modal with 30 recipe lines. No page-wide horizontal overflow. Tables retain local horizontal scroll.
- Builder coverage: search, compatible units, comma decimals, duplicate prevention, edit/delete, close confirmation, failed-save draft retention, unfinished-input prevention, pending-save/dismissal guards, focus restoration, reduced viewport height, Prep save and background refresh protection.
- Existing responsive/export coverage updated to the current paginated API shapes and current Stok Opname heading.
- Eight costing/inventory/unit tests passed. Actual HTTP recipe handler tested against isolated PGlite PostgreSQL with all repository migrations: duplicate/incompatible/precision rejection; rollback on failed version insert for product and Prep recipes; clearing a recipe; historical sale COGS remains Rp10,000 after recipe changes.

Browser UI tests use mocked APIs. HTTP/transaction tests use an isolated PostgreSQL engine, not production Neon. Real iPhone Safari and a physical keyboard opening were not tested. No schema migration is needed, and production data/configuration was not changed.

## Commands

- pnpm run typecheck
- pnpm run build
- pnpm run check:palette
- pnpm run test:recipe:atomic
- pnpm exec playwright test tests/e2e/recipe-builder.spec.ts tests/e2e/responsive-layout.spec.ts

The browser tests require a local Vite server and Playwright browser installation. This environment used a temporary Chromium executable/configuration because the normal browser download failed.
