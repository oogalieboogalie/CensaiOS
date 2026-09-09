import { dispatchTodoItem } from '../server/operational-intelligence/todoDispatch.js';

function createDispatchDb(existingData) {
  let updatedData = null;
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND workspace_id')) {
        return {
          rows: [{
            id: 'todo-1',
            workspace_id: 'workspace-1',
            title: 'Build widget',
            artifact_type: 'task',
            data: existingData,
          }],
        };
      }
      if (sql.includes('UPDATE artifacts SET title')) {
        updatedData = JSON.parse(params[1]);
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1' }] };
      if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) {
        return { rows: [{ id: 'list-1', workspace_id: 'workspace-1', title: 'Plan', artifact_type: 'task_list' }] };
      }
      if (sql.includes('JOIN artifacts task')) {
        return {
          rows: [{
            id: 'todo-1',
            workspace_id: 'workspace-1',
            title: 'Build widget',
            data: updatedData,
            updated_at: '2026-06-14T00:00:00.000Z',
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };

  return {
    get updatedData() {
      return updatedData;
    },
    async query(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
      if (sql.includes('artifact_type = \'task\'')) {
        return {
          rows: [{
            id: 'todo-1',
            workspace_id: 'workspace-1',
            title: 'Build widget',
            artifact_type: 'task',
            data: existingData,
          }],
        };
      }
      if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) {
        return { rows: [{ id: 'list-1', workspace_id: 'workspace-1', title: 'Plan', artifact_type: 'task_list' }] };
      }
      return { rows: [] };
    },
    async connect() {
      return client;
    },
  };
}

describe('todo dispatch idempotency', () => {
  test('repeat dispatch keeps the existing implementation status', async () => {
    const db = createDispatchDb({
      text: 'Build widget',
      assignee: 'jules',
      handoffTaskId: 'agent-task-1',
      implementationStatus: 'pr_open',
      prNumber: 42,
    });

    const result = await dispatchTodoItem(db, {
      workspaceId: 'workspace-1',
      listArtifactId: 'list-1',
      itemArtifactId: 'todo-1',
    });

    expect(db.updatedData).toEqual(expect.objectContaining({
      implementationStatus: 'pr_open',
      handoffTaskId: 'agent-task-1',
      prNumber: 42,
    }));
    expect(result.dispatch).toEqual(expect.objectContaining({
      status: 'reused',
      implementationStatus: 'pr_open',
    }));
  });
});
