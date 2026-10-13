import pool from '../../db.js';
import { createTodoItem } from '../../operational-intelligence/todos.js';

function requireWorkspaceContext(context) {
  if (!context.workspaceId) throw new Error('workspaceId is required');
}

export const operationalCommands = [
  {
    id: 'artifact.search',
    title: 'Search workspace artifacts',
    description: 'Finds artifacts in the current workspace by title and type.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string' },
        limit: { type: 'integer', default: 10 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        items: { type: 'array' },
      },
    },
    requiredCapabilities: ['artifact.read'],
    sideEffects: [],
    async handler({ context, input }) {
      requireWorkspaceContext(context);
      const queryText = String(input.query || '').trim();
      const type = String(input.type || '').trim() || null;
      const limit = Math.max(1, Math.min(Number(input.limit) || 10, 50));
      const searchPattern = `%${queryText}%`;
      const { rows } = await pool.query(
        `SELECT id, workspace_id, artifact_type, title, updated_at
           FROM artifacts
          WHERE workspace_id = $1
            AND deleted_at IS NULL
            AND ($2::text IS NULL OR artifact_type = $2)
            AND ($3::text = '%%' OR title ILIKE $3 OR artifact_type ILIKE $3)
          ORDER BY updated_at DESC
          LIMIT $4`,
        [context.workspaceId, type, searchPattern, limit]
      );
      return {
        workspaceId: context.workspaceId,
        items: rows,
      };
    },
  },
  {
    id: 'operational.todo.create',
    title: 'Create operational to-do item',
    description: 'Creates a workspace-backed operational-intelligence to-do item in the target list.',
    inputSchema: {
      type: 'object',
      required: ['listArtifactId', 'item'],
      properties: {
        listArtifactId: { type: 'string' },
        order: { type: 'integer' },
        item: { type: 'object' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string' },
        title: { type: 'string' },
        items: { type: 'array' },
      },
    },
    requiredCapabilities: ['artifact.write'],
    sideEffects: ['artifact.write', 'event.write'],
    async handler({ context, input }) {
      requireWorkspaceContext(context);
      return createTodoItem(pool, {
        workspaceId: context.workspaceId,
        actor: context.actor,
        listArtifactId: input.listArtifactId,
        item: input.item,
        order: input.order,
      });
    },
  },
];
