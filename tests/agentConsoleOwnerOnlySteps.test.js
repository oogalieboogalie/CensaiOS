import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// A coding agent's task as Pat Example (this computer's owner) and Sam Example
// (a teammate) watch it on the board. Sam sees every step, but nothing of a
// file only Pat opens (a .env, a key file, anything in a hidden folder): not
// what a step read or wrote, not a search line from one, not a command that
// names one, and not the raw output. All files and words are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const KEY = 'not-a-real-made-up-key';
// The task's worktree sits in censaiOS's own hidden state folder, as it does in Docker.
const ROOT = '/made-up/.homebase-state/cli-agents/worktrees/made-up-repo/made-up-task';
const items = [
  { id: 'i1', kind: 'read', title: 'Read notes.md', path: 'notes.md', output: 'Made-up note', status: 'done' },
  { id: 'i2', kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}`, status: 'done' },
  { id: 'i3', kind: 'edit', title: 'Write made-up-server.key', path: 'made-up-server.key', diff: { path: 'made-up-server.key', before: '', after: KEY, isNew: true }, status: 'done' },
  { id: 'i4', kind: 'command', title: 'Add the made-up key', command: `echo MADE_UP_KEY=${KEY} >> .env`, output: '', status: 'done' },
  { id: 'i5', kind: 'command', title: 'Show the git settings', command: 'cat .git/config', output: `url = https://${KEY}@example.invalid/made-up.git`, status: 'done' },
  { id: 'i6', kind: 'search', title: 'Grep MADE_UP', query: 'MADE_UP', output: `notes.md:1:MADE_UP note\n.env:1:MADE_UP_KEY=${KEY}\nconfig/made-up.pem:2:${KEY}`, status: 'done' },
  { id: 'i7', kind: 'search', title: 'Grep url', query: 'url', where: '.git', output: `config:2:url = https://${KEY}@example.invalid`, status: 'done' },
  { id: 'i8', kind: 'tool', title: 'MultiEdit', input: `{"file_path":"made up/.env.local","edits":"MADE_UP_KEY=${KEY}"}`, status: 'done' },
  { id: 'i9', kind: 'command', title: 'Run the made-up tests', command: 'npm test', output: 'Made-up tests pass', status: 'done' },
  { id: 'i10', kind: 'search', title: 'Grep MADE_UP', query: 'MADE_UP', output: `${ROOT}/notes.md:1:MADE_UP note\n${ROOT}/.env:1:MADE_UP_KEY=${KEY}`, status: 'done' },
  { id: 'i11', kind: 'tool', title: 'NotebookEdit', input: `{"notebook_path":"${ROOT}/made-up.ipynb","new_source":"print(1)"}`, status: 'done' },
  { id: 'i12', kind: 'command', title: 'Look at the made-up SSH settings', command: 'cat /made-up/home/.ssh/config', output: `Host made-up\n  IdentityFile ${KEY}`, status: 'done' },
  // Commands that name no such file, but whose output carries lines of one.
  { id: 'i13', kind: 'command', title: 'Search the made-up project', command: 'grep -rn -A1 MADE_UP .', output: `./notes.md:1:MADE_UP note\n./notes.md-2-the made-up plan\n--\n./.env:1:MADE_UP_KEY=${KEY}\n./.env-2-MADE_UP_OTHER=${KEY}\n./config/made-up.pem-3-${KEY}`, status: 'done' },
  { id: 'i14', kind: 'command', title: 'Show what changed', command: 'git diff', output: [
    'diff --git a/notes.md b/notes.md', '--- a/notes.md', '+++ b/notes.md', '@@ -1 +1 @@', '-Made-up note', '+Made-up note, changed',
    'diff --git a/.made-up/settings.json b/.made-up/settings.json', '--- a/.made-up/settings.json', '+++ b/.made-up/settings.json', '@@ -1 +1 @@', '-{}', `+{"madeUp":"${KEY}"}`, '',
  ].join('\n'), status: 'done' },
  { id: 'i15', kind: 'search', title: 'Grep MADE_UP', query: 'MADE_UP', output: `.env\n1:MADE_UP_KEY=${KEY}\n2-MADE_UP_OTHER=${KEY}\n\nnotes.md\n1:MADE_UP note`, status: 'done' },
];
const permissions = [
  { id: 'p0', taskId: 'made-up-task', title: 'Use NotebookEdit', detail: `{"notebook_path":"${ROOT}/made-up.ipynb","new_source":"print(1)"}`, kind: 'tool', diff: null, input: {} },
  { id: 'p1', taskId: 'made-up-task', title: 'Write .env', detail: '.env', kind: 'edit', diff: { path: '.env', before: '', after: `MADE_UP_KEY=${KEY}` }, input: { file_path: '.env', content: `MADE_UP_KEY=${KEY}` } },
  { id: 'p2', taskId: 'made-up-task', title: 'Use NotebookEdit', detail: `{"notebook_path":".made-up/notes.ipynb","new_source":"${KEY}"}`, kind: 'tool', diff: null, input: { new_source: KEY } },
  { id: 'p3', taskId: 'made-up-task', title: 'Run a command', detail: 'npm test', kind: 'command', diff: null, input: { command: 'npm test' } },
];
// What Copilot printed last, which is the task's summary, and the error it stopped with.
const SUMMARY = `Made-up summary: the tests pass.\n./.env:MADE_UP_KEY=${KEY}\n./notes.md:Made-up note`;
const LAST_ERROR = `Made-up error\n./config/made-up.pem:${KEY}`;
const task = { id: 'made-up-task', worktree: { dir: ROOT }, summary: SUMMARY, lastError: LAST_ERROR };
const manager = {
  list: () => [task],
  get: () => task,
  summary: (t) => t,
  changes: async () => ({ files: [], patch: '' }),
  snapshot: () => ({ task: { ...task, prompt: 'Made-up prompt' }, items, permissions, rev: 9 }),
  raw: () => ['made-up raw line', KEY],
  permissions: () => permissions,
};
jest.unstable_mockModule('../server/cli-agents/index.js', () => ({
  getCliTaskManager: () => manager,
  cliRoster: () => [],
  forgetVersions: () => {},
}));

const { cliAgentsRouter } = await import('../server/routes/cliAgents.js');
const { namesOwnerOnly, ownerOnlyStepPath, stepForTeammate } = await import('../server/cli-agents/ownerOnlySteps.js');
const { claudeCode } = await import('../server/cli-agents/adapters/claudeCode.js');
const { SECRET_CHANGES } = await import('../shared/files/fileProblems.js');

function app(userId) {
  const a = express();
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api/cli-agents', cliAgentsRouter);
  return a;
}
const get = (who, route) => request(app(who)).get(`/api/cli-agents${route}`).expect(200);
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const withoutInput = ({ input: _input, ...rest }) => rest;

describe('Pat, the owner,', () => {
  test('sees every step as it is, and the raw output', async () => {
    const { body } = await get(PAT, '/tasks/made-up-task');
    expect(body.items).toEqual(items);
    expect((await get(PAT, '/tasks/made-up-task/raw')).body).toEqual({ lines: ['made-up raw line', KEY] });
  });

  test("sees each request's diff, but never its raw input", async () => {
    for (const route of ['/tasks/made-up-task', '/permissions']) {
      const { body } = await get(PAT, route);
      expect(body.permissions).toEqual(permissions.map(withoutInput));
    }
  });
});

describe('Sam, a teammate,', () => {
  test('sees ordinary steps as they are, judged from the worktree even when it sits in a hidden folder', async () => {
    const shown = byId((await get(SAM, '/tasks/made-up-task')).body.items);
    expect(shown.i1).toEqual(items[0]);
    expect(shown.i9).toEqual(items[8]);
    expect(shown.i11).toEqual(items[10]);
    // The worktree's own folder is taken out of the paths a teammate sees.
    expect(shown.i10.output.split('\n')).toEqual(['notes.md:1:MADE_UP note', '.env: …']);
  });

  test('sees only the title of a step on a hidden folder outside the worktree', async () => {
    const shown = byId((await get(SAM, '/tasks/made-up-task')).body.items);
    expect(shown.i12).toEqual({ id: 'i12', kind: 'command', title: 'Look at the made-up SSH settings', status: 'done', ownerOnly: true });
  });

  test('sees that a step on a file only Pat opens happened, with its title, and nothing it read, wrote or printed', async () => {
    const res = await get(SAM, '/tasks/made-up-task');
    expect(res.text).not.toContain(KEY);
    const shown = byId(res.body.items);
    for (const id of ['i2', 'i3', 'i4', 'i5', 'i7', 'i8']) {
      const step = items.find((i) => i.id === id);
      expect(shown[id]).toMatchObject({ id, kind: step.kind, title: step.title, ownerOnly: true });
      for (const key of ['output', 'diff', 'input', 'command', 'detail']) expect(shown[id]).not.toHaveProperty(key);
    }
    expect(shown.i2.path).toBe('.env');
  });

  test("sees a search's lines from ordinary files, and only the name of a file only Pat opens", async () => {
    const shown = byId((await get(SAM, '/tasks/made-up-task')).body.items);
    expect(shown.i6.output.split('\n')).toEqual(['notes.md:1:MADE_UP note', '.env: …', 'config/made-up.pem: …']);
    expect(shown.i6.ownerOnly).toBeUndefined();
    expect(shown.i15.output.split('\n')).toEqual(['.env', '…', '…', '', 'notes.md', '1:MADE_UP note']);
  });

  test("sees a command's output, without the lines or the diff of a file only Pat opens", async () => {
    const shown = byId((await get(SAM, '/tasks/made-up-task')).body.items);
    expect(shown.i13.output.split('\n')).toEqual(['./notes.md:1:MADE_UP note', './notes.md-2-the made-up plan', '--', './.env: …', './.env: …', './config/made-up.pem: …']);
    expect(shown.i14.output).toContain('+Made-up note, changed');
    expect(shown.i14.output).toContain(`diff --git a/.made-up/settings.json b/.made-up/settings.json\n${SECRET_CHANGES}`);
    for (const id of ['i13', 'i14', 'i15']) {
      expect(shown[id].output).not.toContain(KEY);
      expect(shown[id]).toMatchObject({ title: items.find((i) => i.id === id).title });
    }
  });

  test('sees a request on such a file by its title only, and an ordinary one as it is', async () => {
    for (const route of ['/tasks/made-up-task', '/permissions']) {
      const res = await get(SAM, route);
      expect(res.text).not.toContain(KEY);
      const shown = byId(res.body.permissions);
      expect(shown.p1).toEqual({ id: 'p1', taskId: 'made-up-task', title: 'Write .env', detail: null, kind: 'edit', diff: null, ownerOnly: true });
      expect(shown.p2).toMatchObject({ title: 'Use NotebookEdit', detail: null, ownerOnly: true });
      expect(shown.p3).toEqual(withoutInput(permissions[3]));
      expect(shown.p0).toEqual(withoutInput(permissions[0]));
    }
  });

  test('gets no raw output, told why', async () => {
    expect((await get(SAM, '/tasks/made-up-task/raw')).body).toEqual({ lines: [], ownerOnly: true });
  });
});

describe("a task's own words", () => {
  const taskOf = (body) => body.tasks?.[0] || body.task;

  test('Pat sees its summary and last error as they are', async () => {
    for (const route of ['/tasks', '/tasks/made-up-task']) {
      expect(taskOf((await get(PAT, route)).body)).toMatchObject({ summary: SUMMARY, lastError: LAST_ERROR });
    }
  });

  test("Sam sees them without a key file's lines, which Copilot's printed summary can carry", async () => {
    for (const route of ['/tasks', '/tasks/made-up-task']) {
      const res = await get(SAM, route);
      expect(res.text).not.toContain(KEY);
      expect(taskOf(res.body).summary.split('\n')).toEqual(['Made-up summary: the tests pass.', './.env: …', './notes.md:Made-up note']);
      expect(taskOf(res.body).lastError.split('\n')).toEqual(['Made-up error', './config/made-up.pem: …']);
    }
  });

  test('a review chat, which sits on the board, gets the summary Sam sees, whoever hands the task over', async () => {
    for (const who of [PAT, SAM]) {
      const { body } = await get(who, '/tasks/made-up-task/changes?board=1');
      expect(body.summary.split('\n')).toEqual(['Made-up summary: the tests pass.', './.env: …', './notes.md:Made-up note']);
    }
    expect((await get(PAT, '/tasks/made-up-task/changes')).body).not.toHaveProperty('summary');
  });
});

test('while who is watching cannot be checked, everyone sees what Sam sees', async () => {
  pool.query.mockRejectedValueOnce(new Error('made-up database down'));
  const res = await get(PAT, '/tasks/made-up-task');
  expect(res.text).not.toContain(KEY);
  pool.query.mockRejectedValueOnce(new Error('made-up database down'));
  expect((await get(PAT, '/tasks/made-up-task/raw')).body).toEqual({ lines: [], ownerOnly: true });
});

describe('which words name a file only the owner opens', () => {
  test.each([
    'cat .env', 'grep KEY config/made-up-server.key', 'cat .git/config', 'cp .env.example .env.local',
    'type C:\\made-up\\.env', 'cat "made up/id_ed25519"', 'source ./.envrc && npm start', 'cat ~/.aws/credentials',
  ])('%s does', (words) => expect(namesOwnerOnly(words)).toBe(true));

  test.each([
    'npm test', 'git add .gitignore', 'cat .github/workflows/made-up.yml', 'cat .env.example', "node -e \"require('dotenv').config()\"", 'ls -la', '',
  ])('%s does not', (words) => expect(namesOwnerOnly(words)).toBe(false));

  test('a hidden folder searched as a whole counts, an ordinary one does not', () => {
    expect(ownerOnlyStepPath('.git', { isFile: false })).toBe(true);
    expect(ownerOnlyStepPath('made-up/.ssh', { isFile: false })).toBe(true);
    expect(ownerOnlyStepPath('src', { isFile: false })).toBe(false);
    expect(ownerOnlyStepPath('.github', { isFile: false })).toBe(false);
  });
});

test("a search Claude Code ran in a hidden folder says where it searched, so Sam sees only its title", () => {
  const ops = claudeCode.createParser()({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Grep', input: { pattern: 'url', path: '.git' } }] } });
  const step = ops.find((op) => op.op === 'add' && op.item?.kind === 'search')?.item;
  expect(step).toMatchObject({ kind: 'search', where: '.git' });
  expect(stepForTeammate({ ...step, output: `config:2:url = https://${KEY}@example.invalid` })).toMatchObject({ ownerOnly: true });
  expect(stepForTeammate({ ...step, output: 'x' })).not.toHaveProperty('output');
});
