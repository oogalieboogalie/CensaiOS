import { createArtifact, createRelationship, createWorkspaceEvent, resolveArtifact } from './factories.js';
import { withTransaction } from './transactions.js';

const CAUSALITY_TYPES = ['originated_from', 'generated_by', 'assigned_to', 'depends_on', 'derived_from'];

function assertText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function cleanList(items, label) {
  const list = Array.isArray(items)
    ? items.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  if (!list.length) throw new Error(`${label} is required`);
  return list;
}

function parseLimit(value, fallback) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit < 1) return fallback;
  return Math.min(limit, 100);
}

async function withOptionalTransaction(db, fn) {
  if (typeof db.connect === 'function') return withTransaction(db, fn);
  return fn(db);
}

async function requireWorkspaceArtifact(ctx, workspaceId, artifactId, label) {
  const artifact = await resolveArtifact(ctx, { artifactId, workspaceId });
  if (!artifact || artifact.workspace_id !== workspaceId) throw new Error(`${label} not found`);
  return artifact;
}

function linkRow(row) {
  return {
    relationship: {
      id: row.relationship_id,
      workspace_id: row.relationship_workspace_id,
      source_artifact_id: row.source_artifact_id,
      target_artifact_id: row.target_artifact_id,
      relationship_type: row.relationship_type,
      strength: row.relationship_strength,
      metadata: row.relationship_metadata || {},
      created_by_event_id: row.created_by_event_id,
      created_at: row.relationship_created_at,
      ended_at: row.relationship_ended_at,
    },
    artifact: {
      id: row.artifact_id,
      workspace_id: row.artifact_workspace_id,
      owner_kind: row.owner_kind,
      owner_id: row.owner_id,
      visibility: row.visibility,
      artifact_type: row.artifact_type,
      title: row.title,
      status: row.status,
      data: row.data || {},
      metadata: row.metadata || {},
      source_ref: row.source_ref || {},
      created_at: row.artifact_created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    },
  };
}

async function queryLinks(db, { workspaceId, artifactId, limit, direction }) {
  const artifactColumn = direction === 'upstream' ? 'rel.target_artifact_id' : 'rel.source_artifact_id';
  const linkColumn = direction === 'upstream' ? 'rel.source_artifact_id' : 'rel.target_artifact_id';
  const { rows } = await db.query(
    `SELECT
       rel.id AS relationship_id,
       rel.workspace_id AS relationship_workspace_id,
       rel.source_artifact_id,
       rel.target_artifact_id,
       rel.relationship_type,
       rel.strength AS relationship_strength,
       rel.metadata AS relationship_metadata,
       rel.created_by_event_id,
       rel.created_at AS relationship_created_at,
       rel.ended_at AS relationship_ended_at,
       art.id AS artifact_id,
       art.workspace_id AS artifact_workspace_id,
       art.owner_kind,
       art.owner_id,
       art.visibility,
       art.artifact_type,
       art.title,
       art.status,
       art.data,
       art.metadata,
       art.source_ref,
       art.created_at AS artifact_created_at,
       art.updated_at,
       art.deleted_at
     FROM relationships rel
     JOIN artifacts art ON art.id = ${linkColumn}
    WHERE ${artifactColumn} = $1
      AND rel.workspace_id = $2
      AND art.workspace_id = $2
      AND rel.relationship_type = ANY($3::text[])
      AND rel.ended_at IS NULL
      AND art.deleted_at IS NULL
    ORDER BY rel.created_at DESC
    LIMIT $4`,
    [artifactId, workspaceId, CAUSALITY_TYPES, limit]
  );
  return rows.map(linkRow);
}

export async function ensureAssigneeArtifact(ctx, input) {
  const workspaceId = assertText(input.workspaceId, 'workspaceId');
  const agentId = assertText(input.agentId, 'agentId');
  const sourceRef = { kind: 'agent', agentId };
  const existing = await resolveArtifact(ctx, { workspaceId, sourceRef });
  if (existing) return existing;
  return createArtifact(ctx, {
    workspaceId,
    owner: input.owner,
    type: 'agent',
    title: input.title || agentId,
    data: { agentId },
    metadata: { role: 'handoff-assignee' },
    sourceRef,
    correlationId: input.correlationId,
  });
}

export async function createHandoff(ctx, input) {
  const workspaceId = assertText(input.workspaceId, 'workspaceId');
  const owner = input.owner || { kind: 'system', id: 'censai-system' };
  const title = assertText(input.title, 'title');
  const description = assertText(input.description, 'description');
  const acceptance = cleanList(input.acceptance, 'acceptance');
  const outputs = Array.isArray(input.outputs)
    ? input.outputs.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  return withOptionalTransaction(ctx.db, async (db) => {
    const tx = { db };
    const source = await requireWorkspaceArtifact(tx, workspaceId, input.sourceArtifactId, 'Source artifact');
    const assignee = await requireWorkspaceArtifact(tx, workspaceId, input.assigneeArtifactId, 'Assignee artifact');
    const handoff = await createArtifact(tx, {
      workspaceId,
      owner,
      type: 'handoff',
      title,
      data: { description, acceptance, outputs, priority: input.priority || 'normal' },
      metadata: input.metadata || {},
      correlationId: input.correlationId,
    });
    const originatedFrom = await createRelationship(tx, {
      workspaceId,
      sourceArtifactId: handoff.id,
      targetArtifactId: source.id,
      type: 'originated_from',
      actor: owner,
      correlationId: input.correlationId,
    });
    const assignedTo = await createRelationship(tx, {
      workspaceId,
      sourceArtifactId: handoff.id,
      targetArtifactId: assignee.id,
      type: 'assigned_to',
      actor: owner,
      correlationId: input.correlationId,
    });
    const event = await createWorkspaceEvent(tx, {
      workspaceId,
      type: 'handoff.created',
      actor: owner,
      artifactId: handoff.id,
      correlationId: input.correlationId,
      payload: {
        sourceArtifactId: source.id,
        assigneeArtifactId: assignee.id,
        relationshipIds: [originatedFrom.id, assignedTo.id],
        priority: input.priority || 'normal',
      },
    });
    return { handoff, relationships: [originatedFrom, assignedTo], event };
  });
}

export async function loadArtifactCausality(ctx, input) {
  const workspaceId = assertText(input.workspaceId, 'workspaceId');
  const artifactId = assertText(input.artifactId, 'artifactId');
  const artifact = await requireWorkspaceArtifact(ctx, workspaceId, artifactId, 'Artifact');
  const linkLimit = parseLimit(input.limit, 20);
  const eventLimit = parseLimit(input.limit, 50);
  const [upstream, downstream, eventsResult] = await Promise.all([
    queryLinks(ctx.db, { workspaceId, artifactId, limit: linkLimit, direction: 'upstream' }),
    queryLinks(ctx.db, { workspaceId, artifactId, limit: linkLimit, direction: 'downstream' }),
    ctx.db.query(
      `SELECT *
         FROM workspace_events
        WHERE workspace_id = $1
          AND artifact_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [workspaceId, artifactId, eventLimit]
    ),
  ]);
  return { artifact, upstream, downstream, events: eventsResult.rows };
}
