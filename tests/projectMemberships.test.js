import { jest } from '@jest/globals';
import {
  ProjectMembershipError,
  assertAgentProjectAccess,
  replaceCanvasProjectMemberships,
} from '../server/workspaces/projectMemberships.js';
import { resolveAuthorizedWorkspaceProject } from '../server/workspaces/projectAccess.js';
import { selectEffectiveProjectMemberships } from '../server/workspaces/prewarm.js';

function createDatabase(queryImpl) {
  const client = {
    query: jest.fn(queryImpl),
    release: jest.fn(),
  };
  const db = {
    connect: jest.fn().mockResolvedValue(client),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };
  return { db, client };
}

describe('workspace agent project memberships', () => {
  test('atomically replaces only canvas memberships after validating canonical agents', async () => {
    const { db, client } = createDatabase(async (sql) => {
      if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 'project-1' }] };
      if (sql.includes('SELECT * FROM agents')) return { rows: [{ id: 'architect' }, { id: 'atlas' }] };
      return { rows: [] };
    });

    await replaceCanvasProjectMemberships(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships: [
        { agentId: 'architect', permission: 'work' },
        { agentId: 'atlas', permission: 'read' },
      ],
      userId: 7,
    });

    const statements = client.query.mock.calls.map(([sql]) => sql.trim());
    expect(statements[0]).toBe('BEGIN');
    expect(statements.findIndex((sql) => sql.startsWith('DELETE FROM workspace_agent_projects')))
      .toBeGreaterThan(statements.findIndex((sql) => sql.startsWith('SELECT * FROM agents')));
    expect(statements.filter((sql) => sql.startsWith('INSERT INTO workspace_agent_projects'))).toHaveLength(2);
    expect(statements.find((sql) => sql.startsWith('DELETE FROM workspace_agent_projects')))
      .toContain('NOT (agent_id = ANY($3::text[]))');
    expect(statements.find((sql) => sql.startsWith('INSERT INTO workspace_agent_projects')))
      .toContain('ON CONFLICT (workspace_id, project_id, agent_id, source_kind) DO UPDATE');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('rolls back before deletion when any agent is non-canonical', async () => {
    const { db, client } = createDatabase(async (sql) => {
      if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 'project-1' }] };
      if (sql.includes('SELECT * FROM agents')) return { rows: [{ id: 'atlasmini', name: 'Atlas Mini' }] };
      return { rows: [] };
    });

    await expect(replaceCanvasProjectMemberships(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships: [{ agentId: 'atlasmini', permission: 'work' }],
    })).rejects.toThrow('Unknown or non-canonical agent IDs');

    expect(client.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM workspace_agent_projects'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('read membership cannot satisfy a work permission check', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ permission: 'read' }] }) };
    await expect(assertAgentProjectAccess(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      agentId: 'atlas',
      requiredPermission: 'work',
    })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED', statusCode: 403 });
    await expect(assertAgentProjectAccess(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      agentId: 'atlas',
      requiredPermission: 'read',
    })).resolves.toMatchObject({ permission: 'read' });
  });

  test('rejects duplicate IDs before opening a transaction', async () => {
    const db = { connect: jest.fn() };
    await expect(replaceCanvasProjectMemberships(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships: [
        { agentId: 'atlas', permission: 'work' },
        { agentId: 'atlas', permission: 'read' },
      ],
    })).rejects.toBeInstanceOf(ProjectMembershipError);
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('resolves duplicate project names only through the workspace membership join', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'authorized-censaihub',
            name: 'CensaiHub',
            path: 'C:\\Homebase\\CensaiHub',
            workspace_permission: 'work',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ permission: 'work' }] }),
    };

    await expect(resolveAuthorizedWorkspaceProject(db, {
      workspaceId: 'workspace-1',
      agentId: 'architect',
      projectIdentifier: 'CensaiHub',
      requiredPermission: 'read',
    })).resolves.toMatchObject({ id: 'authorized-censaihub' });

    expect(db.query.mock.calls[0][0]).toContain('JOIN projects p ON p.id = wap.project_id');
    expect(db.query.mock.calls[0][1]).toEqual(['workspace-1', 'architect', 'CensaiHub']);
  });

  test('prewarms each project once using its strongest membership source', () => {
    expect(selectEffectiveProjectMemberships([
      { project_id: 'project-1', permission: 'read', source_kind: 'manual' },
      { project_id: 'project-1', permission: 'work', source_kind: 'canvas' },
      { project_id: 'project-2', permission: 'read', source_kind: 'canvas' },
    ])).toEqual([
      { project_id: 'project-1', permission: 'work', source_kind: 'canvas' },
      { project_id: 'project-2', permission: 'read', source_kind: 'canvas' },
    ]);
  });
});
