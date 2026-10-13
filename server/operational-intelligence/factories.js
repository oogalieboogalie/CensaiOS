import { upsertScopedRelationship } from './relationshipStore.js';

const OWNER_KINDS = new Set(['user', 'agent', 'system']);
const VISIBILITIES = new Set(['private', 'workspace', 'organization', 'public']);

function assertText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function actor(input) {
  const kind = assertText(input?.kind, 'actor.kind');
  const id = assertText(input?.id, 'actor.id');
  if (!OWNER_KINDS.has(kind)) throw new Error(`Invalid actor kind: ${kind}`);
  return { kind, id };
}

function json(value) {
  return JSON.stringify(value && typeof value === 'object' ? value : {});
}

export async function createWorkspaceEvent(ctx, input) {
  const db = ctx.db;
  const who = actor(input.actor);
  const workspaceId = assertText(input.workspaceId, 'workspaceId');
  const type = assertText(input.type, 'type');
  const { rows } = await db.query(
    `INSERT INTO workspace_events
      (workspace_id, event_type, actor_kind, actor_id, artifact_id, relationship_id,
       correlation_id, causation_event_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING *`,
    [
      workspaceId, type, who.kind, who.id, input.artifactId || null,
      input.relationshipId || null, input.correlationId || null,
      input.causationEventId || null, json(input.payload),
    ]
  );
  return rows[0];
}

export async function createArtifact(ctx, input) {
  const db = ctx.db;
  const owner = actor(input.owner);
  const visibility = input.visibility || 'workspace';
  if (!VISIBILITIES.has(visibility)) throw new Error(`Invalid visibility: ${visibility}`);
  const workspaceId = assertText(input.workspaceId, 'workspaceId');
  const type = assertText(input.type, 'type');
  const title = assertText(input.title, 'title');
  const { rows } = await db.query(
    `INSERT INTO artifacts
      (workspace_id, owner_kind, owner_id, visibility, artifact_type, title, data, metadata, source_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
     RETURNING *`,
    [workspaceId, owner.kind, owner.id, visibility, type, title, json(input.data), json(input.metadata), json(input.sourceRef)]
  );
  const artifact = rows[0];
  await createWorkspaceEvent(ctx, {
    workspaceId,
    type: 'artifact.created',
    actor: owner,
    artifactId: artifact.id,
    correlationId: input.correlationId,
    payload: { artifactType: type, title },
  });
  return artifact;
}

export async function createRelationship(ctx, input) {
  const workspaceId = assertText(input.workspaceId, 'workspaceId');
  const type = assertText(input.type, 'type');
  const strength = Number.isFinite(input.strength) ? input.strength : 1;
  const stored = await upsertScopedRelationship(ctx.db, {
    workspaceId,
    sourceArtifactId: input.sourceArtifactId,
    targetArtifactId: input.targetArtifactId,
    type,
    strength,
    metadata: input.metadata,
  });
  if (stored.created) {
    const event = await createWorkspaceEvent(ctx, {
      workspaceId,
      type: 'relationship.created',
      actor: input.actor,
      relationshipId: stored.relationship.id,
      correlationId: input.correlationId,
      payload: { relationshipType: type, sourceArtifactId: input.sourceArtifactId, targetArtifactId: input.targetArtifactId },
    });
    await ctx.db.query('UPDATE relationships SET created_by_event_id = $1 WHERE id = $2', [event.id, stored.relationship.id]);
    return { ...stored.relationship, created_by_event_id: event.id };
  }
  return stored.relationship;
}

export async function resolveArtifact(ctx, ref) {
  if (ref.artifactId) {
    const params = [ref.artifactId];
    let query = 'SELECT * FROM artifacts WHERE id = $1 AND deleted_at IS NULL';
    if (ref.workspaceId) {
      params.push(ref.workspaceId);
      query += ' AND workspace_id = $2';
    }
    const { rows } = await ctx.db.query(query, params);
    return rows[0] || null;
  }
  if (ref.workspaceId && ref.sourceRef) {
    const { rows } = await ctx.db.query(
      'SELECT * FROM artifacts WHERE workspace_id = $1 AND source_ref @> $2::jsonb AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
      [ref.workspaceId, json(ref.sourceRef)]
    );
    return rows[0] || null;
  }
  if (ref.workspaceId && ref.type && ref.title) {
    const { rows } = await ctx.db.query(
      'SELECT * FROM artifacts WHERE workspace_id = $1 AND artifact_type = $2 AND title = $3 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
      [ref.workspaceId, ref.type, ref.title]
    );
    return rows[0] || null;
  }
  throw new Error('Unsupported artifact reference');
}

export async function createExternalArtifact(ctx, { workspaceId, type, title, provider, externalId, data = {}, metadata = {} }) {
  if (!['notification', 'external_task', 'external_message'].includes(type)) {
    throw new Error(`Invalid external artifact type: ${type}`);
  }
  return createArtifact(ctx, {
    workspaceId,
    owner: { kind: 'system', id: provider },
    type,
    title,
    data: { ...data, externalId, provider },
    metadata: { ...metadata, provider },
    sourceRef: { kind: 'external', provider, externalId }
  });
}
