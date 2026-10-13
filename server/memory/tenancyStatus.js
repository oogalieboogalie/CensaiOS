import pool from '../db.js';
import { MEMORY_TENANCY_TABLES, inspectMemoryTenancySchema } from './tenancySchema.js';

export async function getMemoryOwnershipSummary(db = pool) {
  const schema = await inspectMemoryTenancySchema(db);
  if (!schema.ready) return { ready: false, schema, legacyQuarantinedCount: null, scopedCount: null };

  const fragments = MEMORY_TENANCY_TABLES.map((table, index) =>
    `SELECT $${index + 1}::text AS table_name,
            count(*) FILTER (WHERE workspace_id IS NULL)::int AS legacy_count,
            count(*) FILTER (WHERE workspace_id IS NOT NULL)::int AS scoped_count
       FROM ${table}`
  );
  const { rows } = await db.query(fragments.join(' UNION ALL '), MEMORY_TENANCY_TABLES);
  return {
    ready: true,
    legacyQuarantinedCount: rows.reduce((sum, row) => sum + row.legacy_count, 0),
    scopedCount: rows.reduce((sum, row) => sum + row.scoped_count, 0),
    tables: Object.fromEntries(rows.map(row => [row.table_name, {
      legacyQuarantined: row.legacy_count,
      scoped: row.scoped_count,
    }])),
  };
}
