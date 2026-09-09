import {
  createArtifact,
  createRelationship,
  createWorkspaceEvent,
  resolveArtifact,
} from '../server/operational-intelligence/factories.js';
import { createTodoItem, loadItems, openTodoList, updateTodoItem } from '../server/operational-intelligence/todos.js';
import { findZoneReservationConflict } from '../server/operational-intelligence/queueReservations.js';
import { assessTodoDispatch, dispatchTodoItem } from '../server/operational-intelligence/todoDispatch.js';
import { syncTodoArtifactsForAgentTask } from '../server/operational-intelligence/todoSync.js';

function dbWithResponses(responses) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(sql, params);
      return next || { rows: [] };
    },
  };
}

describe('operational intelligence factories', () => {
  test('createArtifact inserts durable object and emits artifact.created', async () => {
    const db = dbWithResponses([
      { rows: [{ id: 'artifact-1', artifact_type: 'task', title: 'Ship it' }] },
      { rows: [{ id: 'event-1', event_type: 'artifact.created' }] },
    ]);

    const artifact = await createArtifact({ db }, {
      workspaceId: 'workspace-1',
      owner: { kind: 'user', id: 'user-7' },
      type: 'task',
      title: 'Ship it',
      data: { done: false },
      sourceRef: { kind: 'test' },
    });

    expect(artifact.id).toBe('artifact-1');
    expect(db.calls[0].sql).toContain('INSERT INTO artifacts');
    expect(db.calls[0].params[0]).toBe('workspace-1');
    expect(db.calls[0].params[4]).toBe('task');
    expect(db.calls[1].sql).toContain('INSERT INTO workspace_events');
    expect(db.calls[1].params[1]).toBe('artifact.created');
  });

  test('createWorkspaceEvent rejects missing workspace ids', async () => {
    await expect(createWorkspaceEvent({ db: dbWithResponses([]) }, {
      type: 'task.created',
      actor: { kind: 'user', id: 'user-7' },
    })).rejects.toThrow('workspaceId is required');
  });

  test('openTodoList emits view.opened with the provided actor id', async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM artifacts WHERE workspace_id = $1 AND source_ref @>')) {
          return {
            rows: [{ id: 'list-1', workspace_id: 'workspace-1', artifact_type: 'task_list', title: 'Plan' }],
          };
        }
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1', event_type: 'view.opened' }] };
        if (sql.includes('JOIN artifacts task')) return { rows: [] };
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      async query(sql) {
        calls.push({ sql, params: [] });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        return { rows: [] };
      },
      async connect() { return client; },
    };

    await openTodoList(db, {
      workspaceId: 'workspace-1',
      windowId: 'todos-1',
      actor: { kind: 'user', id: 'user-7' },
    });

    const viewOpened = calls.find(call => call.sql.includes('INSERT INTO workspace_events'));
    expect(viewOpened.params[1]).toBe('view.opened');
    expect(viewOpened.params[3]).toBe('user-7');
  });

  test('createTodoItem writes owner_id and event actor_id from the provided actor', async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at IS NULL')) {
          return {
            rows: [{ id: 'list-1', workspace_id: 'workspace-1', artifact_type: 'task_list', title: 'Plan' }],
          };
        }
        if (sql.includes('INSERT INTO artifacts')) {
          return { rows: [{ id: 'task-1', workspace_id: 'workspace-1', artifact_type: 'task', title: 'Ship it' }] };
        }
        if (sql.includes('INSERT INTO workspace_events')) {
          return { rows: [{ id: 'event-1', event_type: 'artifact.created' }] };
        }
        if (sql.includes('INSERT INTO relationships')) {
          return { rows: [{ id: 'rel-1' }] };
        }
        if (sql.includes('UPDATE relationships SET created_by_event_id')) return { rows: [] };
        if (sql.includes('JOIN artifacts task')) return { rows: [] };
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      async query(sql) {
        calls.push({ sql, params: [] });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        return { rows: [] };
      },
      async connect() { return client; },
    };

    await createTodoItem(db, {
      workspaceId: 'workspace-1',
      listArtifactId: 'list-1',
      actor: { kind: 'user', id: 'user-7' },
      item: { text: 'Ship it', done: false, assignee: null },
      order: 0,
    });

    const artifactInsert = calls.find(call => call.sql.includes('INSERT INTO artifacts'));
    expect(artifactInsert.params[2]).toBe('user-7');
    const taskCreated = calls.filter(call => call.sql.includes('INSERT INTO workspace_events')).at(-1);
    expect(taskCreated.params[1]).toBe('task.created');
    expect(taskCreated.params[3]).toBe('user-7');
  });

  test('updateTodoItem emits task.updated with the provided actor id', async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at IS NULL')) {
          return {
            rows: [{ id: 'list-1', workspace_id: 'workspace-1', artifact_type: 'task_list', title: 'Plan' }],
          };
        }
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND workspace_id = $2')) {
          return {
            rows: [{ id: 'task-1', workspace_id: 'workspace-1', artifact_type: 'task', title: 'Before', data: { text: 'Before' } }],
          };
        }
        if (sql.includes('UPDATE artifacts SET title = $1')) return { rows: [] };
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1', event_type: 'task.updated' }] };
        if (sql.includes('JOIN artifacts task')) return { rows: [] };
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      async query(sql) {
        calls.push({ sql, params: [] });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        return { rows: [] };
      },
      async connect() { return client; },
    };

    await updateTodoItem(db, {
      workspaceId: 'workspace-1',
      listArtifactId: 'list-1',
      itemArtifactId: 'task-1',
      actor: { kind: 'user', id: 'user-7' },
      patch: { text: 'After' },
    });

    const taskUpdated = calls.find(call => call.sql.includes('INSERT INTO workspace_events'));
    expect(taskUpdated.params[1]).toBe('task.updated');
    expect(taskUpdated.params[3]).toBe('user-7');
  });

  test('createRelationship avoids duplicate active edges', async () => {
    const db = dbWithResponses([
      { rows: [] },
      { rows: [{ id: 'rel-1', relationship_type: 'contains' }] },
    ]);

    const rel = await createRelationship({ db }, {
      workspaceId: 'workspace-1',
      sourceArtifactId: 'list-1',
      targetArtifactId: 'task-1',
      type: 'contains',
      actor: { kind: 'system', id: 'test-suite' },
    });

    expect(rel.id).toBe('rel-1');
    expect(db.calls).toHaveLength(2);
    expect(db.calls[0].sql).toContain('ON CONFLICT');
    expect(db.calls[1].sql).toContain('SELECT * FROM relationships');
    expect(db.calls[1].params[0]).toBe('workspace-1');
  });

  test('createRelationship rejects missing or cross-workspace artifacts', async () => {
    const db = dbWithResponses([{ rows: [] }, { rows: [] }]);

    await expect(createRelationship({ db }, {
      workspaceId: 'workspace-1',
      sourceArtifactId: 'foreign-source',
      targetArtifactId: 'task-1',
      type: 'contains',
      actor: { kind: 'system', id: 'test-suite' },
    })).rejects.toThrow('Cross-workspace or missing artifact relationship');

    expect(db.calls[0].sql).toMatch(/artifacts WHERE id = \$2 AND workspace_id = \$1/);
    expect(db.calls[0].sql).toMatch(/artifacts WHERE id = \$3 AND workspace_id = \$1/);
  });

  test('resolveArtifact scopes direct ids when a workspace is provided', async () => {
    const db = dbWithResponses([{ rows: [] }]);

    await expect(resolveArtifact({ db }, {
      artifactId: 'artifact-foreign',
      workspaceId: 'workspace-1',
    })).resolves.toBeNull();

    expect(db.calls[0].sql).toMatch(/id = \$1[\s\S]*workspace_id = \$2/);
    expect(db.calls[0].params).toEqual(['artifact-foreign', 'workspace-1']);
  });

  test('resolveArtifact supports source references', async () => {
    const db = dbWithResponses([{ rows: [{ id: 'artifact-1' }] }]);

    const artifact = await resolveArtifact({ db }, {
      workspaceId: 'workspace-1',
      sourceRef: { kind: 'window', windowId: 'win-1' },
    });

    expect(artifact.id).toBe('artifact-1');
    expect(db.calls[0].sql).toContain('source_ref @>');
    expect(db.calls[0].params[1]).toBe(JSON.stringify({ kind: 'window', windowId: 'win-1' }));
  });

  test('syncTodoArtifactsForAgentTask marks linked todos merged with proof', async () => {
    let updatedData = null;
    const db = {
      calls: [],
      async query(sql, params = []) {
        this.calls.push({ sql, params });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        if (sql.includes("data->>'handoffTaskId'")) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              data: { text: 'Ship it', done: false, handoffTaskId: 'task-1' },
            }],
          };
        }
        if (sql.includes('UPDATE artifacts SET data')) {
          updatedData = JSON.parse(params[0]);
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              data: updatedData,
              updated_at: '2026-06-13T00:00:00.000Z',
            }],
          };
        }
        if (sql.includes('INSERT INTO workspace_events')) {
          return { rows: [{ id: 'event-1', event_type: 'todo.implementation.merged' }] };
        }
        return { rows: [] };
      },
    };
    const result = await syncTodoArtifactsForAgentTask(db, {
      taskId: 'task-1',
      taskStatus: 'completed',
      result: 'Gate passed.',
      session: {
        jules_session_name: 'sessions/abc',
        branch: 'codex/task',
        pr_number: 42,
        pr_url: 'https://github.com/o/r/pull/42',
        pr_merged_at: '2026-06-13T01:00:00.000Z',
      },
    });

    expect(result[0]).toEqual(expect.objectContaining({
      id: 'todo-1',
      done: true,
      implementationStatus: 'merged',
      prNumber: 42,
      prUrl: 'https://github.com/o/r/pull/42',
      pullRequired: true,
    }));
    expect(updatedData.proof).toBe('Gate passed.');
    expect(db.calls.some(call => call.sql.includes('INSERT INTO workspace_events'))).toBe(true);
  });

  test('assessTodoDispatch refuses unassigned, high-risk, and contractless todos', () => {
    expect(assessTodoDispatch({ text: 'Build the widget' })).toEqual(expect.objectContaining({
      ok: false,
      status: 'needs_contract',
    }));
    expect(assessTodoDispatch({
      text: 'Change auth and secrets handling',
      assignee: 'architect',
    })).toEqual(expect.objectContaining({
      ok: false,
      status: 'needs_contract',
    }));
    expect(assessTodoDispatch({
      text: 'Add the weather widget polish',
      assignee: 'architect',
    })).toEqual(expect.objectContaining({
      ok: false,
      status: 'needs_contract',
      contract: expect.objectContaining({ missing: ['files', 'acceptance'] }),
    }));
  });

  test('assessTodoDispatch accepts todos with files and acceptance contract fields', () => {
    expect(assessTodoDispatch({
      text: [
        'Add the weather widget polish',
        'Files: src/components/WeatherWindow.jsx, tests/weather.test.jsx',
        'Acceptance: npm test -- tests/weather.test.jsx',
      ].join('\n'),
      assignee: 'architect',
    })).toEqual(expect.objectContaining({
      ok: true,
      status: 'queued',
      risk: 'low',
      contract: expect.objectContaining({
        files: ['src/components/WeatherWindow.jsx', 'tests/weather.test.jsx'],
        acceptance: ['npm test -- tests/weather.test.jsx'],
      }),
    }));
  });

  test('dispatchTodoItem writes needs_contract when required fields are missing', async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND workspace_id')) {
          return { rows: [{ id: 'todo-1', workspace_id: 'workspace-1', title: 'Build widget', data: { text: 'Build widget', assignee: 'architect' } }] };
        }
        if (sql.includes('UPDATE artifacts SET title')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO workspace_events')) {
          return { rows: [{ id: 'event-1' }] };
        }
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) {
          return { rows: [{ id: 'list-1', workspace_id: 'workspace-1', title: 'Plan' }] };
        }
        if (sql.includes('JOIN artifacts task')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Build widget',
              data: {
                text: 'Build widget',
                assignee: 'architect',
                implementationStatus: 'needs_contract',
                contractMissing: ['files', 'acceptance'],
              },
              updated_at: '2026-06-13T00:00:00.000Z',
            }],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        if (sql.includes('SELECT *') && sql.includes('artifact_type = \'task\'')) {
          return { rows: [{ id: 'todo-1', workspace_id: 'workspace-1', title: 'Build widget', data: { text: 'Build widget', assignee: 'architect' } }] };
        }
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) {
          return { rows: [{ id: 'list-1', workspace_id: 'workspace-1', title: 'Plan' }] };
        }
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-2' }] };
        return { rows: [] };
      },
      async connect() { return client; },
    };

    const result = await dispatchTodoItem(db, {
      workspaceId: 'workspace-1',
      listArtifactId: 'list-1',
      itemArtifactId: 'todo-1',
    });

    expect(result.dispatch).toEqual(expect.objectContaining({
      ok: false,
      status: 'needs_contract',
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      implementationStatus: 'needs_contract',
      contractMissing: ['files', 'acceptance'],
    }));
    expect(calls.some(call => call.sql.includes('UPDATE artifacts SET title'))).toBe(true);
  });

  test('findZoneReservationConflict detects overlapping in-flight zones', () => {
    expect(findZoneReservationConflict(
      ['src/components/todos/TodoRow.jsx'],
      [{ brief: 'active.md', zones: ['src/components/todos/'] }]
    )).toEqual(expect.objectContaining({
      overlap: 'src/components/todos/TodoRow.jsx',
      brief: 'active.md',
    }));
    expect(findZoneReservationConflict(
      ['server/routes/chat.js'],
      [{ brief: 'active.md', zones: ['src/components/todos/'] }]
    )).toBeNull();
  });

  test('dispatchTodoItem queues instead of handoff when file zones overlap queue reservations', async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND workspace_id')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Build widget',
              data: {
                text: [
                  'Build widget',
                  'Files: src/components/todos/TodoRow.jsx',
                  'Acceptance: npm test -- tests/todosOperationalIntelligence.test.jsx',
                ].join('\n'),
                assignee: 'architect',
              },
            }],
          };
        }
        if (sql.includes('UPDATE artifacts SET title')) return { rows: [] };
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1' }] };
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) return { rows: [{ id: 'list-1', workspace_id: 'workspace-1', title: 'Plan' }] };
        if (sql.includes('JOIN artifacts task')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Build widget',
              data: {
                implementationStatus: 'queued',
                handoffWarning: 'Waiting for in-flight work on src/components/todos/TodoRow.jsx (active.md).',
              },
              updated_at: '2026-06-13T00:00:00.000Z',
            }],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        if (sql.includes('artifact_type = \'task\'')) {
          return {
            rows: [{
              id: 'todo-1',
              workspace_id: 'workspace-1',
              title: 'Build widget',
              data: {
                text: [
                  'Build widget',
                  'Files: src/components/todos/TodoRow.jsx',
                  'Acceptance: npm test -- tests/todosOperationalIntelligence.test.jsx',
                ].join('\n'),
                assignee: 'architect',
              },
            }],
          };
        }
        if (sql.includes('SELECT * FROM artifacts WHERE id = $1 AND deleted_at')) return { rows: [{ id: 'list-1', workspace_id: 'workspace-1', title: 'Plan' }] };
        if (sql.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-2' }] };
        return { rows: [] };
      },
      async connect() { return client; },
    };

    const result = await dispatchTodoItem(db, {
      workspaceId: 'workspace-1',
      listArtifactId: 'list-1',
      itemArtifactId: 'todo-1',
      queueReservations: [{ brief: 'active.md', zones: ['src/components/todos/'] }],
    });

    expect(result.dispatch).toEqual(expect.objectContaining({
      ok: false,
      status: 'queued',
      conflict: expect.objectContaining({ brief: 'active.md' }),
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      implementationStatus: 'queued',
    }));
  });

  test('loadItems returns ordered todo items from artifact relationships', async () => {
    const db = {
      async query(sql, params = []) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS artifacts')) return { rows: [] };
        if (sql.includes('JOIN artifacts task')) {
          return {
            rows: [
              { id: 'task-a', title: 'First', data: { text: 'First', done: false, assignee: null }, updated_at: '2026-06-13T00:00:00.000Z' },
              { id: 'task-b', title: 'Second', data: { text: 'Second', done: true, assignee: 'atlas' }, updated_at: '2026-06-13T00:01:00.000Z' },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const items = await loadItems(db, 'workspace-1', 'list-1');

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(expect.objectContaining({ id: 'task-a', text: 'First', done: false }));
    expect(items[1]).toEqual(expect.objectContaining({ id: 'task-b', text: 'Second', done: true, assignee: 'atlas' }));
  });
});
