import { createArtifact, createRelationship, createWorkspaceEvent, resolveArtifact } from './factories.js';
import { ensureOperationalIntelligenceSchema } from './schema.js';
import { itemData, rowToItem } from './todoModel.js';
import { withTransaction } from './transactions.js';

function routeActor(input) {
  const actor = input.actor || input.owner;
  if (!actor) throw new Error('actor is required');
  return actor;
}

async function requireWorkspaceArtifact(ctx, { workspaceId, artifactId, label }) {
  const artifact = await resolveArtifact(ctx, { artifactId, workspaceId });
  if (!artifact || artifact.workspace_id !== workspaceId) throw new Error(`${label} not found`);
  return artifact;
}

export async function loadItems(db, workspaceId, listArtifactId) {
  const { rows } = await db.query(
    `SELECT task.*
       FROM relationships rel
       JOIN artifacts task ON task.id = rel.target_artifact_id
      WHERE rel.workspace_id = $1
        AND rel.source_artifact_id = $2
        AND rel.relationship_type = 'contains'
        AND rel.ended_at IS NULL
        AND task.deleted_at IS NULL
      ORDER BY COALESCE((rel.metadata->>'order')::int, 0), task.created_at ASC`,
    [workspaceId, listArtifactId]
  );
  return rows.map(rowToItem);
}

async function ensureList(ctx, input) {
  const { workspaceId, artifactId, windowId, title, seedItems = [] } = input;
  const owner = routeActor(input);
  const sourceRef = { kind: 'window', windowId };
  const found = artifactId
    ? await requireWorkspaceArtifact(ctx, { workspaceId, artifactId, label: 'To-do list artifact' })
    : await resolveArtifact(ctx, { workspaceId, sourceRef });
  if (found) return found;

  const list = await createArtifact(ctx, {
    workspaceId,
    owner,
    type: 'task_list',
    title: title || 'To-do List',
    data: { viewKind: 'todos' },
    sourceRef,
  });

  for (const [index, seed] of seedItems.entries()) {
    const data = itemData(seed);
    const task = await createArtifact(ctx, {
      workspaceId,
      owner,
      type: 'task',
      title: data.text,
      data,
      sourceRef: { kind: 'todo-item', windowId, localId: data.localId },
    });
    await createRelationship(ctx, {
      workspaceId,
      sourceArtifactId: list.id,
      targetArtifactId: task.id,
      type: 'contains',
      metadata: { order: index },
      actor: owner,
    });
  }
  return list;
}

export async function openTodoList(db, input) {
  await ensureOperationalIntelligenceSchema(db);
  return withTransaction(db, async (client) => {
    const ctx = { db: client };
    const owner = routeActor(input);
    const list = await ensureList(ctx, input);
    await createWorkspaceEvent(ctx, {
      workspaceId: input.workspaceId,
      type: 'view.opened',
      actor: owner,
      artifactId: list.id,
      payload: { viewKind: 'todos', windowId: input.windowId || null },
    });
    return { list, items: await loadItems(client, input.workspaceId, list.id) };
  });
}

export async function createTodoItem(db, input) {
  await ensureOperationalIntelligenceSchema(db);
  return withTransaction(db, async (client) => {
    const ctx = { db: client };
    const owner = routeActor(input);
    const list = await requireWorkspaceArtifact(ctx, {
      workspaceId: input.workspaceId,
      artifactId: input.listArtifactId,
      label: 'To-do list artifact',
    });
    const data = itemData(input.item);
    const task = await createArtifact(ctx, {
      workspaceId: input.workspaceId,
      owner,
      type: 'task',
      title: data.text,
      data,
      sourceRef: { kind: 'todo-item', listArtifactId: list.id, localId: data.localId },
    });
    await createRelationship(ctx, {
      workspaceId: input.workspaceId,
      sourceArtifactId: list.id,
      targetArtifactId: task.id,
      type: 'contains',
      metadata: { order: input.order || 0 },
      actor: owner,
    });
    await createWorkspaceEvent(ctx, {
      workspaceId: input.workspaceId,
      type: 'task.created',
      actor: owner,
      artifactId: task.id,
      payload: { listArtifactId: list.id, text: data.text },
    });
    return { list, items: await loadItems(client, input.workspaceId, list.id) };
  });
}

export async function updateTodoItem(db, input) {
  await ensureOperationalIntelligenceSchema(db);
  return withTransaction(db, async (client) => {
    const owner = routeActor(input);
    await requireWorkspaceArtifact({ db: client }, {
      workspaceId: input.workspaceId,
      artifactId: input.listArtifactId,
      label: 'To-do list artifact',
    });
    const current = await client.query(
      'SELECT * FROM artifacts WHERE id = $1 AND workspace_id = $2 AND artifact_type = $3 AND deleted_at IS NULL',
      [input.itemArtifactId, input.workspaceId, 'task']
    );
    const task = current.rows[0];
    if (!task) throw new Error('Task artifact not found');
    const nextData = { ...(task.data || {}), ...input.patch };
    const title = input.patch.text ? String(input.patch.text).trim() : task.title;
    await client.query(
      'UPDATE artifacts SET title = $1, data = $2::jsonb, updated_at = NOW() WHERE id = $3',
      [title, JSON.stringify(nextData), task.id]
    );
    await createWorkspaceEvent({ db: client }, {
      workspaceId: input.workspaceId,
      type: 'task.updated',
      actor: owner,
      artifactId: task.id,
      payload: { listArtifactId: input.listArtifactId, patch: input.patch },
    });
    const list = await resolveArtifact({ db: client }, {
      artifactId: input.listArtifactId,
      workspaceId: input.workspaceId,
    });
    return { list, items: await loadItems(client, input.workspaceId, input.listArtifactId) };
  });
}
