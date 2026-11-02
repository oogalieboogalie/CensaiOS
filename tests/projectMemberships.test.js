import { jest } from '@jest/globals';
import { canvasAgentAllowed } from '../server/workspaces/canvasAgentAccess.js';
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

  test('a board agent\'s chat window stands for its parent instead of failing the whole board', async () => {
    const { db, client } = createDatabase(async (sql) => {
      if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 'project-1' }] };
      if (sql.includes('FROM sub_agents')) return { rows: [{ id: 'lead-1', parent_id: 'censai' }, { id: 'critic-1', parent_id: 'censai' }] };
      if (sql.includes('SELECT * FROM agents')) return { rows: [{ id: 'censai' }, { id: 'atlas' }] };
      return { rows: [] };
    });

    await replaceCanvasProjectMemberships(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships: [
        { agentId: 'lead-1', permission: 'read' },
        { agentId: 'critic-1', permission: 'work' },
        { agentId: 'atlas', permission: 'work' },
      ],
    });

    const lookup = client.query.mock.calls.find(([sql]) => sql.includes('FROM sub_agents'));
    expect(lookup[1]).toEqual(['workspace-1', ['lead-1', 'critic-1', 'atlas']]);
    const inserts = client.query.mock.calls.filter(([sql]) => sql.trim().startsWith('INSERT INTO workspace_agent_projects'));
    expect(inserts.map(([, params]) => [params[2], params[3]])).toEqual([['censai', 'work'], ['atlas', 'work']]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('an owner save authorizes a custom agent already on the board', async () => {
    const { db, client } = createDatabase(async (sql) => {
      if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 'project-1' }] };
      if (sql.includes('SELECT role FROM workspace_members')) return { rows: [{ role: 'owner' }] };
      if (sql.includes('SELECT * FROM agents')) return { rows: [{ id: 'argon', name: 'Argon' }] };
      return { rows: [] };
    });

    await replaceCanvasProjectMemberships(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships: [{ agentId: 'argon', permission: 'work' }],
      userId: 2,
    });

    const inserts = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO workspace_agent_projects'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][2]).toBe('argon');
    expect(inserts[0][1][3]).toBe('work');
  });

  test('a member save still rejects a custom agent before deleting memberships', async () => {
    const { db, client } = createDatabase(async (sql) => {
      if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 'project-1' }] };
      if (sql.includes('SELECT role FROM workspace_members')) return { rows: [{ role: 'member' }] };
      if (sql.includes('SELECT * FROM agents')) return { rows: [{ id: 'argon', name: 'Argon' }] };
      return { rows: [] };
    });

    await expect(replaceCanvasProjectMemberships(db, {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      memberships: [{ agentId: 'argon', permission: 'work' }],
      userId: 318,
    })).rejects.toThrow('Unknown or non-canonical agent IDs: argon');

    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM workspace_agent_projects'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('an owner save still rejects unknown, duplicate, and development agents', async () => {
    const refused = [
      { requested: 'atlas-1', agent: { id: 'atlas-1', name: 'Atlas' } },
      { requested: 'test_argon', agent: { id: 'test_argon', name: 'Argon' } },
      { requested: 'missing', agent: null },
    ];
    for (const { requested, agent } of refused) {
      const { db, client } = createDatabase(async (sql) => {
        if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 'project-1' }] };
        if (sql.includes('SELECT role FROM workspace_members')) return { rows: [{ role: 'owner' }] };
        if (sql.includes('SELECT * FROM agents')) return { rows: agent ? [agent] : [] };
        return { rows: [] };
      });
      await expect(replaceCanvasProjectMemberships(db, {
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        memberships: [{ agentId: requested, permission: 'work' }],
        userId: 2,
      })).rejects.toThrow(`Unknown or non-canonical agent IDs: ${requested}`);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    }
  });

  test('custom access is owner-only and family access stays open', () => {
    expect(canvasAgentAllowed({ id: 'argon', name: 'Argon' }, { allowCustom: true })).toBe(true);
    expect(canvasAgentAllowed({ id: 'argon', name: 'Argon' })).toBe(false);
    expect(canvasAgentAllowed({ id: 'atlas', name: 'Atlas' })).toBe(true);
    expect(canvasAgentAllowed({ id: 'atlas-1', name: 'Atlas' }, { allowCustom: true })).toBe(false);
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
            path: 'C:\\Repos\\CensaiHub',
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
    expect(db.query.mock.calls[0][0]).toContain("regexp_replace(p.path, '^.*[/\\\\]', '')");
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
