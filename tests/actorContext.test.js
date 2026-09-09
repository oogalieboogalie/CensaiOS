import {
  createArtifact,
  createRelationship,
  createWorkspaceEvent,
} from '../server/operational-intelligence/factories.js';
import { openTodoList } from '../server/operational-intelligence/todos.js';

const emptyDb = {
  query: async () => ({ rows: [] }),
};

describe('operational actor requirements', () => {
  test('artifact and event factories reject missing actors', async () => {
    await expect(createArtifact({ db: emptyDb }, {
      workspaceId: 'workspace-1',
      type: 'task',
      title: 'Task',
    })).rejects.toThrow('actor.kind is required');

    await expect(createWorkspaceEvent({ db: emptyDb }, {
      workspaceId: 'workspace-1',
      type: 'task.created',
    })).rejects.toThrow('actor.kind is required');
  });

  test('relationship events reject missing actors', async () => {
    const db = {
      query: async (sql) => sql.includes('INSERT INTO relationships')
        ? { rows: [{ id: 'relationship-1' }] }
        : { rows: [] },
    };

    await expect(createRelationship({ db }, {
      workspaceId: 'workspace-1',
      sourceArtifactId: 'source-1',
      targetArtifactId: 'target-1',
      type: 'contains',
    })).rejects.toThrow('actor.kind is required');
  });

  test('todo helpers reject missing route actors', async () => {
    const client = {
      query: async () => ({ rows: [] }),
      release() {},
    };
    const db = {
      query: async () => ({ rows: [] }),
      connect: async () => client,
    };

    await expect(openTodoList(db, {
      workspaceId: 'workspace-1',
      windowId: 'todos-1',
    })).rejects.toThrow('actor is required');
  });
});
