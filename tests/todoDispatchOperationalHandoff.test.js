import { jest } from '@jest/globals';

const createProjectHandoffRecord = jest.fn();
const ensureAssigneeArtifact = jest.fn();
const createHandoff = jest.fn();

jest.unstable_mockModule('../server/routes/projects/handoffs.js', () => ({
  createProjectHandoffRecord,
}));
jest.unstable_mockModule('../server/operational-intelligence/handoffs.js', () => ({
  ensureAssigneeArtifact,
  createHandoff,
}));

const { dispatchTodoItem } = await import('../server/operational-intelligence/todoDispatch.js');

describe('todo dispatch operational handoff composition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('composes the generic handoff artifact into dispatched todo metadata', async () => {
    createProjectHandoffRecord.mockResolvedValue({
      relativePath: '.team/handoffs/ship-it.md',
      task: { id: 'agent-task-1' },
      taskSkipped: null,
    });
    ensureAssigneeArtifact.mockResolvedValue({ id: 'agent-artifact-1' });
    createHandoff.mockResolvedValue({ handoff: { id: 'handoff-artifact-1' } });

    const client = {
      async query(sql, params = []) {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND workspace_id')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Ship it',
              data: {
                text: [
                  'Ship it',
                  'Files: src/app/AppContent.jsx',
                  'Acceptance: npm test -- tests/todoDispatchOperationalHandoff.test.js',
                ].join('\n'),
                assignee: 'architect',
              },
            }],
          };
        }
        if (sql.includes('UPDATE artifacts SET title')) return { rows: [] };
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1' }] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) {
          return { rows: [{ id: 'list-1', title: 'Plan', workspace_id: 'workspace-1' }] };
        }
        if (sql.includes('JOIN artifacts task')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Ship it',
              data: {
                text: 'Ship it',
                assignee: 'architect',
                implementationStatus: 'queued',
                handoffPath: '.team/handoffs/ship-it.md',
                handoffTaskId: 'agent-task-1',
                handoffArtifactId: 'handoff-artifact-1',
              },
              updated_at: '2026-06-19T00:00:00.000Z',
            }],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      async query(sql, params = []) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        if (sql.includes('artifact_type = \'task\'')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Ship it',
              data: {
                text: [
                  'Ship it',
                  'Files: src/app/AppContent.jsx',
                  'Acceptance: npm test -- tests/todoDispatchOperationalHandoff.test.js',
                ].join('\n'),
                assignee: 'architect',
              },
            }],
          };
        }
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) {
          return { rows: [{ id: 'list-1', title: 'Plan', workspace_id: 'workspace-1' }] };
        }
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-2' }] };
        return { rows: [] };
      },
      async connect() {
        return client;
      },
    };

    const result = await dispatchTodoItem(db, {
      workspaceId: 'workspace-1',
      listArtifactId: 'list-1',
      itemArtifactId: 'todo-1',
    });

    expect(createProjectHandoffRecord).toHaveBeenCalled();
    expect(ensureAssigneeArtifact).toHaveBeenCalledWith({ db }, expect.objectContaining({
      workspaceId: 'workspace-1',
      agentId: 'architect',
    }));
    expect(createHandoff).toHaveBeenCalledWith({ db }, expect.objectContaining({
      workspaceId: 'workspace-1',
      assigneeArtifactId: 'agent-artifact-1',
      sourceArtifactId: 'todo-1',
      metadata: expect.objectContaining({ handoffPath: '.team/handoffs/ship-it.md' }),
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      handoffArtifactId: 'handoff-artifact-1',
      handoffTaskId: 'agent-task-1',
      implementationStatus: 'queued',
    }));
  });
});
