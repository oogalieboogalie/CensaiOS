// A to-do handed to a board agent (server/routes/projects/handoffs.js) becomes
// a task for one of that agent's helpers. The helper reaches projects through
// its parent agent's access on the board, so a hand-off to an agent with no
// window on the board used to be refused in every project tool. Now the task
// carries the hand-off's project, and while the task is open the agent has
// that one project with the access of the person who handed it off; it goes
// when the task ends (server/censaiOrchestrator/projectShare.js).
//
// Made-up board: Pat owns this computer and the board, Sam is a member, Vic
// only views. "MadeUpBase" is open on this computer; Atlas has no window on
// the board, so the board gives it nothing. Only the database is a stand-in.
import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

const stateDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-todo-handoff-')));
const BASE = path.join(stateDir, 'MadeUpBase');
const OTHER_FOLDER = path.join(stateDir, 'MadeUpOther');
for (const folder of [BASE, OTHER_FOLDER]) fs.mkdirSync(folder);
fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'MadeUpBase', path: BASE }));
fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([BASE]));
const priorStateDir = process.env.CENSAI_STATE_DIR;
process.env.CENSAI_STATE_DIR = stateDir;

const BOARD = 'ws-1';
const [PAT, VIC, SAM] = [7, 8, 9];
const PROJECTS = [
  { id: 'made-up-base', name: 'MadeUpBase', path: BASE, repo: null, updated_at: '2026-11-01' },
  { id: 'made-up-other', name: 'MadeUpOther', path: OTHER_FOLDER, repo: null, updated_at: '2026-11-02' },
];
const HELPER = { id: 'atlas-helper', parent_id: 'atlas', workspace_id: BOARD, permission: 'worker', active: true, name: 'Atlas builder', role: 'builder', created_at: '2026-11-01' };
// A custom agent of the board's owner, with a helper of its own.
const CUSTOM_HELPER = { ...HELPER, id: 'bot-helper', parent_id: 'made-up-bot', name: 'Bot builder' };
const HELPERS = [HELPER, CUSTOM_HELPER];

// Just enough of the database for these statements.
function standInDb() {
  const db = {
    shares: [], // workspace_agent_projects
    tasks: [], // agent_tasks
    members: { [BOARD]: { [PAT]: 'owner', [VIC]: 'viewer', [SAM]: 'member' } },
  };
  const folderName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
  const byWork = (a, b) => (a.permission === 'work' ? 0 : 1) - (b.permission === 'work' ? 0 : 1);
  let ids = 0;
  db.query = async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.includes('FROM workspace_agent_projects wap JOIN projects p ON p.id = wap.project_id WHERE wap.workspace_id = $1 AND wap.agent_id = $2')) {
      const [workspaceId, agentId, wanted] = params;
      const key = String(wanted || '').toLowerCase();
      const lent = (row) => row.source_kind === 'task' || String(row.source_id).startsWith('agent-task:');
      const lentLast = (a, b) => (wanted ? 0 : lent(a) - lent(b));
      const hits = db.shares.filter((row) => row.workspace_id === workspaceId && row.agent_id === agentId)
        .sort((a, b) => lentLast(a, b) || byWork(a, b))
        .map((row) => ({ row, project: PROJECTS.find((p) => p.id === row.project_id) }))
        .filter(({ project }) => project && (!wanted || project.id === wanted || project.name.toLowerCase() === key
          || project.path === wanted || folderName(project.path).toLowerCase() === key));
      return { rows: hits.slice(0, 1).map(({ row, project }) => ({ ...project, workspace_permission: row.permission })) };
    }
    if (text.startsWith('SELECT permission FROM workspace_agent_projects')) {
      const [workspaceId, projectId, agentId] = params;
      const rows = db.shares.filter((row) => row.workspace_id === workspaceId && row.project_id === projectId && row.agent_id === agentId);
      return { rows: rows.sort(byWork).slice(0, 1).map((row) => ({ permission: row.permission })) };
    }
    if (text.startsWith('SELECT 1 FROM workspace_agent_projects')) {
      return { rows: db.shares.filter((r) => r.workspace_id === params[0] && r.project_id === params[1]).map(() => ({ on_board: 1 })) };
    }
    const sameKey = (r, [workspaceId, projectId, agentId], kind) => r.workspace_id === workspaceId
      && r.project_id === projectId && r.agent_id === agentId && r.source_kind === kind;
    if (text.startsWith('INSERT INTO workspace_agent_projects') && text.includes("'task'")) {
      // A plan of Censai's loan (server/censaiOrchestrator/projectShare.js shareProject).
      const [workspaceId, projectId, agentId, permission, sourceId] = params;
      const row = db.shares.find((r) => sameKey(r, params, 'task'));
      if (row) Object.assign(row, { permission, source_id: sourceId });
      else db.shares.push({ workspace_id: workspaceId, project_id: projectId, agent_id: agentId, permission, source_kind: 'task', source_id: sourceId });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO workspace_agent_projects') && text.includes("'manual'")) {
      // A to-do's loan: a new row, or another to-do's loan that now lists this task too.
      const [workspaceId, projectId, agentId, permission, sourceId, , taskId] = params;
      const row = db.shares.find((r) => sameKey(r, params, 'manual'));
      if (!row) {
        db.shares.push({ workspace_id: workspaceId, project_id: projectId, agent_id: agentId, permission, source_kind: 'manual', source_id: sourceId });
        return { rows: [], rowCount: 1 };
      }
      if (!row.source_id.startsWith('agent-task:')) return { rows: [], rowCount: 0 };
      row.source_id = `${row.source_id},${taskId}`;
      if (row.permission !== 'work') row.permission = permission;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('SELECT workspace_id, project_id, agent_id, source_id FROM workspace_agent_projects')) {
      return { rows: db.shares.filter((r) => r.source_kind === 'manual' && r.source_id.startsWith('agent-task:')).map((r) => ({ ...r })) };
    }
    if (text.startsWith('SELECT id::text AS id FROM agent_tasks')) {
      return { rows: db.tasks.filter((t) => params[0].includes(t.id) && !params[1].includes(t.status)).map(({ id }) => ({ id })) };
    }
    if (text.startsWith('UPDATE workspace_agent_projects SET source_id = $5')) {
      const row = db.shares.find((r) => sameKey(r, params, 'manual') && r.source_id === params[3]);
      if (row) row.source_id = params[4];
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('DELETE FROM workspace_agent_projects')) {
      let gone;
      if (text.includes("source_kind = 'manual'")) {
        gone = (row) => sameKey(row, params, 'manual') && row.source_id === params[3];
      } else {
        const plan = (row) => row.source_kind === 'task' && row.source_id.startsWith('censai-plan:');
        gone = text.includes('agent_id = ANY')
          ? (row) => plan(row) && row.workspace_id === params[0] && row.project_id === params[1] && params[2].includes(row.agent_id)
          : plan;
      }
      const before = db.shares.length;
      db.shares = db.shares.filter((row) => !gone(row));
      return { rows: [], rowCount: before - db.shares.length };
    }
    if (text.startsWith('SELECT id, path FROM projects WHERE id = $1')) {
      return { rows: PROJECTS.filter((p) => p.id === params[0]).map(({ id, path: folder }) => ({ id, path: folder })) };
    }
    if (text.startsWith('SELECT path FROM projects WHERE id = $1')) {
      return { rows: PROJECTS.filter((p) => p.id === params[0]).map(({ path: folder }) => ({ path: folder })) };
    }
    if (text.includes('FROM projects p') && text.includes('p.path IS NOT NULL')) {
      const onBoard = new Set(db.shares.filter((r) => r.workspace_id === params[0]).map((r) => r.project_id));
      return { rows: [...PROJECTS].sort((a, b) => onBoard.has(b.id) - onBoard.has(a.id) || b.updated_at.localeCompare(a.updated_at))
        .map(({ id, path: folder }) => ({ id, path: folder })) };
    }
    if (text.startsWith('SELECT * FROM sub_agents WHERE parent_id = $1 AND workspace_id = $2')) {
      return { rows: HELPERS.filter((h) => h.parent_id === params[0] && h.workspace_id === params[1]).map((h) => ({ ...h })) };
    }
    if (text.startsWith('INSERT INTO agent_tasks')) {
      const [parentId, assigneeId, projectId, project, title, prompt, priority, , , , workspaceId, userId] = params;
      ids += 1;
      const row = {
        id: `task-${ids}`, parent_id: parentId, assignee_id: assigneeId, project_id: projectId, project, title, prompt,
        priority, status: 'queued', workspace_id: workspaceId, created_by_user_id: userId,
      };
      db.tasks.push(row);
      return { rows: [{ ...row }] };
    }
    if (text.startsWith('SELECT * FROM agent_tasks WHERE id = $1 AND workspace_id = $2')) {
      return { rows: db.tasks.filter((t) => t.id === params[0] && t.workspace_id === params[1]).map((t) => ({ ...t })) };
    }
    if (text.startsWith('SELECT project_id, project FROM agent_tasks WHERE id = $1')) {
      return { rows: db.tasks.filter((t) => t.id === params[0]).map(({ project_id: projectId, project }) => ({ project_id: projectId, project })) };
    }
    if (text.startsWith('UPDATE agent_tasks SET')) {
      const [id, workspaceId] = params.slice(-2);
      const task = db.tasks.find((t) => t.id === id && t.workspace_id === workspaceId);
      const status = text.match(/status = \$(\d+)/);
      if (task && status) task.status = params[Number(status[1]) - 1];
      return { rows: task ? [{ ...task }] : [] };
    }
    if (text.startsWith('SELECT id, tenant_id FROM workspaces WHERE id = $1')) {
      return { rows: db.members[params[0]] ? [{ id: params[0], tenant_id: null }] : [] };
    }
    if (text.includes('FROM workspaces w JOIN workspace_members wm')) {
      const role = db.members[params[0]]?.[params[1]];
      return { rows: role ? [{ id: params[0], name: 'Stand-in board', role }] : [] };
    }
    if (text.startsWith('SELECT * FROM agents WHERE id = ANY($1)')) {
      return { rows: params[0].map((id) => ({ id, name: id === 'atlas' ? 'Atlas' : 'Made-up helper bot' })) };
    }
    if (text.startsWith('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2')) {
      const role = db.members[params[0]]?.[params[1]];
      return { rows: role ? [{ role }] : [] };
    }
    if (text === 'SELECT role FROM users WHERE id = $1') return { rows: [{ role: params[0] === PAT ? 'admin' : 'user' }] };
    throw new Error(`stand-in database: unexpected SQL: ${text.slice(0, 140)}`);
  };
  return db;
}

let db = standInDb();
const pool = { query: (...args) => db.query(...args) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: jest.fn(async () => null),
  getSubAgentById: jest.fn(async (id) => (id === HELPER.id ? { ...HELPER } : null)),
}));

const { createProjectHandoffRecord } = await import('../server/routes/projects/handoffs.js');
const { updateAgentTask } = await import('../server/memory/tasks.js');
const { resolveProjectForCall } = await import('../server/tools/helpers.js');
const { shareProject, takeBackPlanProject } = await import('../server/censaiOrchestrator/projectShare.js');

const handOff = (title, { userId = PAT, assignee = 'atlas' } = {}) => createProjectHandoffRecord({
  title, text: title, assignee, sourceTitle: 'Project To-Dos', sourceId: `todo:${title}`, workspaceId: BOARD, userId,
});

/**
 * What Atlas's helper reaches while it does `task`. It is looked at from a teammate's chat (Sam):
 * this computer's owner is not held to the board's list at all (server/workspaces/ownerProjects.js,
 * tests/ownerAnyProject.test.js), so only a teammate shows what the board, and its loans, give.
 */
async function whatTheHelperReaches(task) {
  const context = { workspaceId: BOARD, userId: SAM, agentTaskId: task.id };
  const reach = (project, permission) => resolveProjectForCall(HELPER.id, project, { ...context, requiredProjectPermission: permission })
    .then(({ project: found }) => found.id, (error) => error.code);
  return {
    unnamed: await reach(null, 'work'),
    read: await reach('MadeUpBase', 'read'),
    work: await reach('MadeUpBase', 'work'),
    other: await reach('MadeUpOther', 'read'),
  };
}

const NOTHING = { unnamed: 'PROJECT_ACCESS_DENIED', read: 'PROJECT_ACCESS_DENIED', work: 'PROJECT_ACCESS_DENIED', other: 'PROJECT_ACCESS_DENIED' };
const ALL_OF_BASE = { unnamed: 'made-up-base', read: 'made-up-base', work: 'made-up-base', other: 'PROJECT_ACCESS_DENIED' };
// A plan's loan (source_kind 'task') or a to-do's (source_id 'agent-task:...').
const loansTo = (agentId) => db.shares.filter((row) => row.agent_id === agentId
  && (row.source_kind === 'task' || String(row.source_id).startsWith('agent-task:')));
const end = (task, status = 'completed') => updateAgentTask(task.id, { status, result: 'Done.' }, { workspaceId: BOARD });

beforeEach(() => {
  db = standInDb();
  fs.rmSync(path.join(BASE, '.team'), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
  if (priorStateDir === undefined) delete process.env.CENSAI_STATE_DIR;
  else process.env.CENSAI_STATE_DIR = priorStateDir;
});

describe('a to-do handed to an agent with no window on the board', () => {
  test('the task carries the project, and the helper works there with the access of the person who handed it off', async () => {
    const { task } = await handOff('Add a line to the notes');
    expect(task).toMatchObject({ parent_id: 'atlas', assignee_id: HELPER.id, project_id: 'made-up-base' });
    expect(await whatTheHelperReaches(task)).toEqual(ALL_OF_BASE);
    expect(loansTo('atlas')).toEqual([expect.objectContaining({ project_id: 'made-up-base', permission: 'work', source_id: `agent-task:${task.id}` })]);
  });

  test('when the task ends, the access goes with it', async () => {
    const { task } = await handOff('Add a line to the notes');
    await end(task);
    expect(loansTo('atlas')).toEqual([]);
    expect(await whatTheHelperReaches(task)).toEqual(NOTHING);
  });

  test('a task that fails or is cancelled gives it back too', async () => {
    for (const status of ['failed', 'cancelled']) {
      const { task } = await handOff(`Try it ${status}`);
      await end(task, status);
      expect(loansTo('atlas')).toEqual([]);
    }
  });

  test('two open to-dos in the project: the first to end leaves it for the other', async () => {
    const { task: first } = await handOff('First change');
    const { task: second } = await handOff('Second change');
    expect(loansTo('atlas')).toEqual([expect.objectContaining({ source_id: `agent-task:${first.id},${second.id}` })]);
    await end(first);
    expect(loansTo('atlas')).toEqual([expect.objectContaining({ source_id: `agent-task:${second.id}` })]);
    expect(await whatTheHelperReaches(second)).toEqual(ALL_OF_BASE);
    await end(second);
    expect(loansTo('atlas')).toEqual([]);
  });

  test('a task closed some other way (a pull request sync, a deleted helper) is swept up', async () => {
    const { takeBackEndedTaskShares } = await import('../server/censaiOrchestrator/projectShare.js');
    const { task } = await handOff('Add a line to the notes');
    db.tasks.find((t) => t.id === task.id).status = 'completed';
    expect(await takeBackEndedTaskShares(db)).toBe(1);
    expect(loansTo('atlas')).toEqual([]);
  });

  test('a board member may hand off too; someone who only views the board lends nothing', async () => {
    const { task } = await handOff('Sam asks for a change', { userId: SAM });
    expect(await whatTheHelperReaches(task)).toEqual(ALL_OF_BASE);
    await end(task);

    const { task: viewers } = await handOff('Vic asks for a change', { userId: VIC });
    expect(loansTo('atlas')).toEqual([]);
    // Nothing lent, so the task is not pointed at a project its helper cannot open: it carries what it did before.
    expect(viewers.project_id).toBe('MadeUpBase');
    expect(await whatTheHelperReaches(viewers)).toEqual(NOTHING);
  });

  test("a custom agent gets the project only from the board's owner, as on a board save", async () => {
    await handOff('Sam asks the bot', { userId: SAM, assignee: 'made-up-bot' });
    expect(loansTo('made-up-bot')).toEqual([]);
    await handOff('Pat asks the bot', { userId: PAT, assignee: 'made-up-bot' });
    expect(loansTo('made-up-bot')).toEqual([expect.objectContaining({ project_id: 'made-up-base', permission: 'work' })]);
  });

  test('only the tasks the to-do made keep it: another task of Atlas in the project does not', async () => {
    const { task } = await handOff('Add a line to the notes');
    // Atlas sends a helper more work in the project while it has the loan (submit_agent_task).
    db.tasks.push({ id: 'atlas-own', parent_id: 'atlas', assignee_id: HELPER.id, project_id: 'made-up-base', status: 'queued', workspace_id: BOARD });
    await end(task);
    expect(loansTo('atlas')).toEqual([]);
  });

  test('a to-do that starts while the old one is being taken back keeps its loan', async () => {
    const { takeBackEndedTaskShares } = await import('../server/censaiOrchestrator/projectShare.js');
    const { task: first } = await handOff('First change');
    db.tasks.find((t) => t.id === first.id).status = 'completed';
    let second = null;
    // The next to-do is handed off between the sweep reading the loans and taking one back.
    const racing = {
      query: async (sql, params) => {
        const result = await db.query(sql, params);
        if (!second && sql.includes('FROM agent_tasks WHERE id::text')) second = (await handOff('Second change')).task;
        return result;
      },
    };
    expect(await takeBackEndedTaskShares(racing)).toBe(0);
    expect(await whatTheHelperReaches(second)).toEqual(ALL_OF_BASE);
    // The next pass drops only the ended task.
    await takeBackEndedTaskShares(db);
    expect(loansTo('atlas')).toEqual([expect.objectContaining({ source_id: `agent-task:${second.id}` })]);
  });

  test('a project Atlas was given for good (open_project) stays given for good', async () => {
    const forGood = { workspace_id: BOARD, project_id: 'made-up-base', agent_id: 'atlas', permission: 'work', source_kind: 'manual', source_id: 'open_project' };
    db.shares.push({ ...forGood });
    const { task } = await handOff('Add a line to the notes');
    expect(await whatTheHelperReaches(task)).toEqual(ALL_OF_BASE);
    await end(task);
    expect(db.shares).toEqual([forGood]);
  });

  test('what the board gave Atlas itself is never touched', async () => {
    db.shares.push({ workspace_id: BOARD, project_id: 'made-up-other', agent_id: 'atlas', permission: 'read', source_kind: 'canvas', source_id: BOARD });
    const { task } = await handOff('Add a line to the notes');
    await end(task);
    expect(db.shares).toEqual([expect.objectContaining({ project_id: 'made-up-other', source_kind: 'canvas', permission: 'read' })]);
  });
});

describe('a to-do and a plan of Censai lend Atlas the same project', () => {
  const plan = { id: 'p1', workspaceId: BOARD, userId: PAT, project: 'MadeUpBase', jobs: [{ agentId: 'atlas' }] };
  const withCensai = () => db.shares.push({ workspace_id: BOARD, project_id: 'made-up-base', agent_id: 'censai', permission: 'work', source_kind: 'canvas', source_id: BOARD });

  test('the plan ends first: the open to-do keeps it until it ends', async () => {
    withCensai();
    const shared = await shareProject(db, { planId: plan.id, workspaceId: BOARD, userId: PAT, project: 'MadeUpBase', agentIds: ['atlas'] });
    const { task } = await handOff('Add a line to the notes');
    await takeBackPlanProject(db, plan, shared, []);
    expect(await whatTheHelperReaches(task)).toEqual(ALL_OF_BASE);
    await end(task);
    expect(loansTo('atlas')).toEqual([]);
  });

  test('they never share a row: Censai reads only, so once the to-do ends Atlas reads only', async () => {
    withCensai();
    db.shares.find((r) => r.agent_id === 'censai').permission = 'read';
    await shareProject(db, { planId: plan.id, workspaceId: BOARD, userId: PAT, project: 'MadeUpBase', agentIds: ['atlas'] });
    const { task } = await handOff('Add a line to the notes');
    expect(await whatTheHelperReaches(task)).toEqual(ALL_OF_BASE);
    await end(task);
    // Reading still works; anything that changes files (the unnamed call asks for that too) does not.
    expect(await whatTheHelperReaches(task)).toEqual({ ...ALL_OF_BASE, unnamed: 'PROJECT_ACCESS_DENIED', work: 'PROJECT_ACCESS_DENIED' });
  });

  test("a plan's loan ends with the plan, whatever tasks Atlas still has open there", async () => {
    withCensai();
    const shared = await shareProject(db, { planId: plan.id, workspaceId: BOARD, userId: PAT, project: 'MadeUpBase', agentIds: ['atlas'] });
    db.tasks.push({ id: 'atlas-own', parent_id: 'atlas', assignee_id: HELPER.id, project_id: 'made-up-base', status: 'queued', workspace_id: BOARD });
    await takeBackPlanProject(db, plan, shared, []);
    expect(loansTo('atlas')).toEqual([]);
  });

  test('the to-do ends first: the plan keeps it until it ends', async () => {
    withCensai();
    const shared = await shareProject(db, { planId: plan.id, workspaceId: BOARD, userId: PAT, project: 'MadeUpBase', agentIds: ['atlas'] });
    const { task } = await handOff('Add a line to the notes');
    await end(task);
    expect(loansTo('atlas')).toEqual([expect.objectContaining({ project_id: 'made-up-base', source_id: 'censai-plan:p1' })]);
    await takeBackPlanProject(db, plan, shared, []);
    expect(loansTo('atlas')).toEqual([]);
  });
});
