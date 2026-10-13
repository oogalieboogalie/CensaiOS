import db from '../db.js';
import { ensureOperationalIntelligenceSchema } from './schema.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/**
 * Records AI-generated code provenance.
 *
 * Records are only written for a real, authorized workspace: an unscoped
 * record could never be listed safely, so without one this is a no-op.
 *
 * @param {Object} params
 * @param {string|null} params.workspace_id - The authorized workspace the chat ran in
 * @param {string} params.agent_id - The agent that generated the code
 * @param {number|string|null} [params.user_id] - The user whose chat produced the code
 * @param {string} params.prompt - The full prompt used to generate the code
 * @param {string} params.model - The model name and version
 * @param {string} params.code_snippet - The actual code generated
 * @param {string} params.file_path - Where the code was written
 * @param {Object} [params.metadata] - Optional extra metadata (repo, project, branch)
 */
export async function recordProvenance({
  workspace_id,
  agent_id,
  user_id = null,
  prompt,
  model,
  code_snippet,
  file_path,
  metadata = {}
}, { db: database = db } = {}) {
  if (!workspace_id) return null;
  await ensureOperationalIntelligenceSchema(database);

  const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt ?? '');
  const code = String(code_snippet ?? '');
  const title = `AI Generation: ${file_path}`;

  const artifactResult = await database.query(
    `INSERT INTO artifacts (
      workspace_id, owner_kind, owner_id, artifact_type, title, data, metadata
    ) VALUES ($1, 'agent', $2, 'ai_provenance', $3, $4, $5)
    RETURNING id`,
    [
      workspace_id,
      agent_id,
      title,
      { code_snippet: code, file_path, model, prompt_preview: promptText.slice(0, 1000) },
      { ...metadata, full_prompt: promptText, model_version: model, user_id: user_id == null ? null : String(user_id) },
    ]
  );

  const artifactId = artifactResult.rows[0].id;

  await database.query(
    `INSERT INTO workspace_events (
      workspace_id, event_type, actor_kind, actor_id, artifact_id, payload
    ) VALUES ($1, 'agent.code_generation', 'agent', $2, $3, $4)`,
    [workspace_id, agent_id, artifactId, { file_path, model, snippet_length: code.length }]
  );

  return artifactId;
}

/**
 * The prompt is the requesting user's own chat message. Other members of a
 * shared workspace see what was generated and by which agent and model, but
 * not someone else's prompt text.
 */
export function sanitizeProvenanceArtifact(row, { viewerUserId = null } = {}) {
  const data = row?.data || {};
  const metadata = row?.metadata || {};
  const ownPrompt = viewerUserId != null && metadata.user_id != null
    && String(metadata.user_id) === String(viewerUserId);
  const { full_prompt: fullPrompt, ...restMetadata } = metadata;
  const promptLength = String(fullPrompt ?? data.prompt_preview ?? '').length;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    owner_id: row.owner_id,
    title: row.title,
    created_at: row.created_at,
    data: {
      file_path: data.file_path,
      model: data.model,
      code_snippet: data.code_snippet,
      ...(ownPrompt ? { prompt_preview: data.prompt_preview } : {}),
    },
    metadata: {
      ...restMetadata,
      prompt_visible: ownPrompt,
      prompt_length: promptLength,
      ...(ownPrompt ? { full_prompt: fullPrompt } : {}),
    },
  };
}

export async function listAuthorizedProvenance(database, {
  workspaceId,
  viewerUserId = null,
  filePath = null,
  limit = DEFAULT_LIST_LIMIT,
} = {}) {
  const params = [workspaceId, listLimit(limit)];
  let fileClause = '';
  if (filePath) {
    params.push(String(filePath));
    fileClause = `AND data->>'file_path' = $${params.length}`;
  }
  const { rows } = await database.query(
    `SELECT * FROM artifacts
      WHERE workspace_id = $1
        AND artifact_type = 'ai_provenance'
        AND deleted_at IS NULL
        ${fileClause}
      ORDER BY created_at DESC LIMIT $2`,
    params
  );
  return rows.map(row => sanitizeProvenanceArtifact(row, { viewerUserId }));
}

/** One record plus the workspace events that reference it (its lineage). */
export async function findAuthorizedProvenance(database, {
  workspaceId,
  artifactId,
  viewerUserId = null,
} = {}) {
  const { rows } = await database.query(
    `SELECT * FROM artifacts
      WHERE id = $1
        AND workspace_id = $2
        AND artifact_type = 'ai_provenance'
        AND deleted_at IS NULL
      LIMIT 1`,
    [artifactId, workspaceId]
  );
  if (!rows[0]) return null;
  const events = await database.query(
    `SELECT id, event_type, actor_kind, actor_id, payload, created_at FROM workspace_events
      WHERE artifact_id = $1 AND workspace_id = $2
      ORDER BY created_at ASC`,
    [artifactId, workspaceId]
  );
  return {
    ...sanitizeProvenanceArtifact(rows[0], { viewerUserId }),
    events: events.rows,
  };
}

function listLimit(limit) {
  const n = Number.parseInt(limit, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}
