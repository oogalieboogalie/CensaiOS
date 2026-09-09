const AGENT_CARD_TENANCY_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_cards_workspace_id_fkey'
  ) THEN
    ALTER TABLE agent_cards ADD CONSTRAINT agent_cards_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_cards_legacy_unscoped
  ON agent_cards (created_at)
  WHERE owner_id IS NOT NULL AND workspace_id IS NULL AND deleted_at IS NULL;
`;

export async function ensureAgentCardTenancySchema(db) {
  await db.query(AGENT_CARD_TENANCY_SQL);
}

export async function readAgentCardTenancySchema(db) {
  const [constraints, indexes] = await Promise.all([
    db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conname='agent_cards_workspace_id_fkey'`),
    db.query(`SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_agent_cards_legacy_unscoped'`),
  ]);
  return { constraints: constraints.rows, indexes: indexes.rows };
}
