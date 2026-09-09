function json(value) {
  return JSON.stringify(value && typeof value === 'object' ? value : {});
}

export async function upsertScopedRelationship(db, input) {
  const insert = await db.query(
    `INSERT INTO relationships
      (workspace_id, source_artifact_id, target_artifact_id, relationship_type, strength, metadata)
     SELECT $1,$2,$3,$4,$5,$6::jsonb
      WHERE EXISTS (
        SELECT 1 FROM artifacts WHERE id = $2 AND workspace_id = $1 AND deleted_at IS NULL
      )
        AND EXISTS (
          SELECT 1 FROM artifacts WHERE id = $3 AND workspace_id = $1 AND deleted_at IS NULL
        )
     ON CONFLICT (source_artifact_id, target_artifact_id, relationship_type) WHERE ended_at IS NULL
     DO NOTHING
     RETURNING *`,
    [
      input.workspaceId,
      input.sourceArtifactId,
      input.targetArtifactId,
      input.type,
      input.strength,
      json(input.metadata),
    ],
  );
  if (insert.rows[0]) return { relationship: insert.rows[0], created: true };
  const { rows } = await db.query(
    `SELECT * FROM relationships
     WHERE workspace_id = $1 AND source_artifact_id = $2 AND target_artifact_id = $3
       AND relationship_type = $4 AND ended_at IS NULL
     LIMIT 1`,
    [input.workspaceId, input.sourceArtifactId, input.targetArtifactId, input.type],
  );
  if (!rows[0]) throw new Error('Cross-workspace or missing artifact relationship');
  return { relationship: rows[0], created: false };
}
