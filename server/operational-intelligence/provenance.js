import db from '../db.js';
import { ensureOperationalIntelligenceSchema } from './schema.js';

/**
 * Records AI-generated code provenance.
 *
 * @param {Object} params
 * @param {string} params.workspace_id - The workspace ID (e.g. agentId or project name)
 * @param {string} params.agent_id - The agent that generated the code
 * @param {string} params.prompt - The full prompt used to generate the code
 * @param {string} params.model - The model name and version
 * @param {string} params.code_snippet - The actual code generated
 * @param {string} params.file_path - Where the code was written
 * @param {Object} [params.metadata] - Optional extra metadata
 */
export async function recordProvenance({
  workspace_id,
  agent_id,
  prompt,
  model,
  code_snippet,
  file_path,
  metadata = {}
}) {
  await ensureOperationalIntelligenceSchema(db);

  const title = `AI Generation: ${file_path}`;
  const artifact_type = 'ai_provenance';

  // We use the artifacts table for the core provenance record
  const artifactQuery = `
    INSERT INTO artifacts (
      workspace_id,
      owner_kind,
      owner_id,
      artifact_type,
      title,
      data,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `;

  const artifactResult = await db.query(artifactQuery, [
    workspace_id,
    'agent',
    agent_id,
    artifact_type,
    title,
    { code_snippet, file_path, model, prompt_preview: prompt.slice(0, 1000) },
    { ...metadata, full_prompt: prompt, model_version: model }
  ]);

  const artifactId = artifactResult.rows[0].id;

  // We also log a workspace event for the generation event
  const eventQuery = `
    INSERT INTO workspace_events (
      workspace_id,
      event_type,
      actor_kind,
      actor_id,
      artifact_id,
      payload
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `;

  await db.query(eventQuery, [
    workspace_id,
    'agent.code_generation',
    'agent',
    agent_id,
    artifactId,
    { file_path, model, snippet_length: code_snippet.length }
  ]);

  return artifactId;
}

/**
 * Retrieves provenance for a specific file path.
 */
export async function getProvenanceByFilePath(workspace_id, file_path) {
  await ensureOperationalIntelligenceSchema(db);

  const query = `
    SELECT * FROM artifacts
    WHERE workspace_id = $1
      AND artifact_type = 'ai_provenance'
      AND data->>'file_path' = $2
    ORDER BY created_at DESC
  `;

  const res = await db.query(query, [workspace_id, file_path]);
  return res.rows;
}
