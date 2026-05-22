# Fixture: sql-migration

Adds migration 0042: an up migration that adds `created_at` (backfilled to the
Unix epoch) and `updated_at` (defaulting to `NOW()`) columns to the `orders`
table, and a `BEFORE UPDATE` trigger `orders_updated_at` that calls
`orders_set_updated_at()` to keep `updated_at` current. The down migration
drops the trigger, then the function, then the columns (order matters).

This fixture tests whether the LLM can reason about SQL DDL, trigger semantics,
epoch-backfill implications for existing rows, and rollback ordering.
